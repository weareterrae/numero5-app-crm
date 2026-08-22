# Corre a bateria de qualidade dos assistentes, em lotes.
#
# É isto que a tarefa agendada executa. À mão, para ver o resultado:
#   powershell -ExecutionPolicy Bypass -File scripts\ai-qualidade-correr.ps1
#
# PORQUE EM LOTES
#
# Cada pergunta são duas chamadas a modelos — uma para responder, outra
# para julgar. O Supabase corta a ligação aos 150s, e medimos que três
# perguntas levam ~62s. Seis já não cabiam.
#
# A função serve as MAIS ANTIGAS primeiro, por isso chamá-la sete vezes
# cobre a bateria toda e nenhuma pergunta fica para trás por ter calhado
# no fim da lista.
#
# SÓ ESCREVE QUANDO HÁ MÁ NOTÍCIA. Uma corrida diária que registasse
# «tudo bem» enchia o ficheiro e enterrava as notas que interessam.
#
# ESTE FICHEIRO TEM DE FICAR EM UTF-8 COM BOM. O PowerShell 5.1 lê um
# .ps1 sem BOM como ANSI e os acentos saem trocados.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# As chaves vivem no .env.local do repositório, como o resto dos guiões.
$env_ = @{}
Get-Content (Join-Path $repo ".env.local") | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.+)$') { $env_[$Matches[1]] = $Matches[2].Trim() }
}
$url = $env_["NEXT_PUBLIC_SUPABASE_URL"]
$chave = $env_["SUPABASE_SERVICE_ROLE_KEY"]
$registo = Join-Path $repo "scripts\_registo-qualidade.txt"
$quando = Get-Date -Format "yyyy-MM-dd HH:mm"

if (-not $url -or -not $chave) {
  Add-Content -Path $registo -Encoding utf8 -Value "$quando  SEM CREDENCIAIS no .env.local"
  exit 1
}

$maus = @()
$notas = @()

# Sete lotes de três cobrem as 21 perguntas de hoje. Se a bateria
# crescer, aumenta-se aqui — a função nunca repete as mesmas primeiro.
for ($i = 1; $i -le 7; $i++) {
  try {
    # Invoke-RestMethod no PowerShell 5.1 não descodifica UTF-8 quando a
    # resposta não declara charset: «não» chegava ao registo como «nÃ£o».
    # Um registo com acentos partidos deixa de ser lido. Lêem-se os bytes
    # em bruto e descodifica-se à mão.
    $w = Invoke-WebRequest -Method Post -Uri "$url/functions/v1/ai-qualidade?quantas=3" `
      -Headers @{ authorization = "Bearer $chave"; "content-type" = "application/json" } `
      -Body "{}" -TimeoutSec 200 -UseBasicParsing
    $r = [System.Text.Encoding]::UTF8.GetString($w.RawContentStream.ToArray()) | ConvertFrom-Json
  } catch {
    $maus += "lote $i não correu: $($_.Exception.Message)"
    continue
  }
  foreach ($x in $r.resultados) {
    if ($null -ne $x.nota) {
      $notas += $x.nota
      # 3 ou menos é o limiar de «merece olhos». Abaixo disso é avaria.
      if ($x.nota -le 3) { $maus += "$($x.nota)/5  $($x.assistente)  $($x.pergunta)" }
    } elseif ($x.erro) {
      $maus += "ERRO  $($x.pergunta): $($x.erro)"
    }
  }
}

if ($notas.Count -eq 0) {
  Add-Content -Path $registo -Encoding utf8 -Value "$quando  A BATERIA NÃO DEU NENHUMA NOTA — ver se a função responde."
  exit 1
}

$media = [math]::Round(($notas | Measure-Object -Average).Average, 2)

# Silêncio quando está tudo bem. Escreve-se quando há o que ler.
if ($maus.Count -eq 0) { exit 0 }

Add-Content -Path $registo -Encoding utf8 -Value @"

===== $quando ===== média $media em $($notas.Count) perguntas
$($maus -join "`r`n")
"@
exit 0
