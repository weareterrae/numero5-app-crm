# Corre a vigia da pasta do SIR e deixa registo do que aconteceu.
#
# É isto que a tarefa agendada executa. Não se corre à mão — para isso há
#   npx tsx scripts/imo-vigiar-pasta-sir.mts
#
# SÓ ESCREVE QUANDO HÁ NOTÍCIA. Uma corrida de hora a hora que registasse
# «nada de novo» encheria o ficheiro com 24 linhas por dia e enterrava as
# que interessam. Silêncio quer dizer que está tudo em ordem; se lá está
# escrito alguma coisa, é porque entrou um relatório ou falhou um.
#
# ESTE FICHEIRO TEM DE FICAR GRAVADO EM UTF-8 COM BOM. O Windows
# PowerShell 5.1 lê um .ps1 sem BOM como ANSI, e os acentos saem trocados
# — «NÃO CORREU» apareceu no registo como «NÃƒO CORREU». Quem editar isto
# num editor que grave sem BOM parte os acentos sem dar por isso.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$pasta = if ($env:IMO_PASTA_SIR) { $env:IMO_PASTA_SIR }
         else { "C:\Users\sandr\OneDrive\Número Cinco\_Documentos-e-Assets\SIR" }
$quando = Get-Date -Format "yyyy-MM-dd HH:mm"

# O registo fica ao pé dos PDF, que é onde a pessoa está a olhar.
#
# Mas não pode SÓ ficar lá: quando a pasta é o problema — o OneDrive não
# sincronizou, o caminho mudou — é exatamente aí que não há onde escrever,
# e a mensagem mais importante de todas perdia-se. Então há um segundo
# sítio, dentro do repositório, que existe sempre.
$registoNormal = Join-Path $pasta "_registo-da-importacao.txt"
$registoRecurso = Join-Path $repo "scripts\_registo-sir-falhas.txt"

function Escrever($texto) {
  try {
    Add-Content -Path $registoNormal -Encoding utf8 -Value $texto -ErrorAction Stop
  } catch {
    Add-Content -Path $registoRecurso -Encoding utf8 -ErrorAction SilentlyContinue -Value @"
$texto
(escrito aqui porque não consegui escrever em $registoNormal)
"@
  }
}

try {
  $saida = (& npx tsx scripts/imo-vigiar-pasta-sir.mts 2>&1 | Out-String)
} catch {
  Escrever "`r`n===== $quando =====`r`nNÃO CORREU: $($_.Exception.Message)"
  exit 1
}

$temResumo = $saida -match '(\d+) importados'
$novos     = if ($temResumo) { [int]$Matches[1] } else { 0 }
$falhados  = if ($saida -match '(\d+) não deram') { [int]$Matches[1] } else { 0 }

# Se a linha de resumo desapareceu, os números acima são zeros por
# ignorância, não por bom estado — e uma falha real passaria em silêncio.
# Regista tudo e sai com erro, em vez de fingir que correu bem.
if (-not $temResumo) {
  Escrever @"

===== $quando =====
NÃO PERCEBI O QUE A ROTINA DISSE (a linha de resumo mudou de forma).
Nada foi interpretado — leia isto à mão:
$saida
"@
  exit 1
}

if ($novos -eq 0 -and $falhados -eq 0) { exit 0 }   # nada a dizer

# As linhas que interessam: o que entrou, o que falhou, e o que a rotina
# decidiu sobre a geografia (freguesias novas e nomes que casou).
$linhas = $saida -split "`r?`n" | Where-Object {
  $_ -match 'NOVO|✓|✗|\+ freguesia nova|≡|SEM MICRO-SIR'
}

Escrever @"

===== $quando =====
$($linhas -join "`r`n")
"@

exit 0
