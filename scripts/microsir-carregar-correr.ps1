# Corre o carregamento do MicroSIR e deixa registo.
#
# Chamado pela tarefa agendada. A colheita em si acontece no Apify (dia 3
# de cada mes, 04:00); isto so vai buscar a ultima corrida boa e mete-a no
# Supabase.
#
# CORRE TODOS OS DIAS DE PROPOSITO
#
# O carregamento e idempotente: a mesma colheita carregada duas vezes
# atualiza, nao duplica. Correr diariamente custa dois pedidos e faz com
# que um dia falhado se cure sozinho no dia seguinte, em vez de esperar um
# mes inteiro por outra oportunidade.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$registo = Join-Path $repo "scripts\_registo-microsir.txt"

function Escrever($texto) {
  $linha = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $texto
  Add-Content -Path $registo -Value $linha -Encoding utf8
}

try {
  Set-Location $repo
  $saida = & node "scripts\imo-carregar-microsir.mjs" 2>&1 | Out-String
  $codigo = $LASTEXITCODE

  # O resumo do carregador e a linha que interessa; o resto e ruido.
  $resumo = ($saida -split "`n" | Where-Object { $_ -match "gravadas:|sem geografia:|Dataset " }) -join " | "
  if (-not $resumo) { $resumo = ($saida -split "`n" | Select-Object -Last 3) -join " " }

  if ($codigo -eq 0) {
    Escrever "ok    $resumo"
  } else {
    # Codigo 2 e "carregou mas ficaram zonas sem geografia" — nao e falha
    # total, mas e trabalho por rever e nao pode passar despercebido.
    Escrever "AVISO (codigo $codigo)  $resumo"
  }
} catch {
  Escrever "ERRO  $($_.Exception.Message)"
  exit 1
}
