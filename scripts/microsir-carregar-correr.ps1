# Corre o carregamento do MicroSIR e deixa registo.
#
# Chamado pela tarefa agendada. A colheita em si acontece no Apify (dia 3
# de cada mes, 04:00); isto so vai buscar a ultima varredura boa e mete-a
# no Supabase.
#
# CORRE TODOS OS DIAS DE PROPOSITO
#
# O carregamento e idempotente: a mesma colheita carregada duas vezes
# atualiza, nao duplica. Correr diariamente custa dois pedidos e faz com
# que um dia falhado se cure sozinho no dia seguinte, em vez de esperar um
# mes inteiro por outra oportunidade.
#
# DUAS LICOES DE NOVE DIAS DE «ERRO» SEM MENSAGEM (24-08 a 02-09)
#
# 1. Com $ErrorActionPreference = "Stop", o PowerShell 5.1 transforma a
#    primeira linha que um programa escreve no stderr numa excecao, e a
#    mensagem dessa excecao vinha vazia. O registo dizia «ERRO» e mais
#    nada, e ninguem soube durante nove dias que o carregador estava a
#    apanhar a corrida errada do Apify. Agora o node corre por cmd.exe com
#    o stderr junto ao stdout (texto para o registo, nao excecao), le-se o
#    codigo de saida, e no registo ficam as linhas que interessam.
# 2. O `exit 1` dentro do catch do carregamento saltava a fila dos
#    codigos postais, que corre a seguir. Sao independentes de proposito
#    (o comentario ja o dizia) mas o codigo nao cumpria. Agora a fila
#    corre sempre, e o codigo de saida do trabalho reflete os dois.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$registo = Join-Path $repo "scripts\_registo-microsir.txt"

function Escrever($texto) {
  $linha = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $texto
  Add-Content -Path $registo -Value $linha -Encoding utf8
}

# Corre um script node e devolve codigo + saida. O stderr vai junto com o
# stdout dentro do cmd.exe, por isso nunca chega ao PowerShell como erro.
function CorrerNode($script, $argumentos) {
  $ErrorActionPreference = "Continue"
  try {
    $saida = & cmd.exe /c "node `"$script`" $argumentos 2>&1" | Out-String
    $codigo = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = "Stop"
  }
  return @{ Codigo = $codigo; Saida = $saida }
}

# As linhas que interessam do que o script disse; se nenhuma bater no
# padrao, as ultimas N, para o registo nunca ficar em branco.
function Resumir($saida, $padrao, $ultimas) {
  $linhas = @(($saida -split "`n") | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ })
  $r = (@($linhas | Where-Object { $_ -match $padrao })) -join " | "
  if (-not $r) { $r = (@($linhas | Select-Object -Last $ultimas)) -join " | " }
  return $r
}

Set-Location $repo
$falhou = $false

# ---------------------------------------------------------------------
# O CARREGAMENTO
# ---------------------------------------------------------------------
try {
  $r = CorrerNode "scripts\imo-carregar-microsir.mjs" ""
  $resumo = Resumir $r.Saida "gravadas:|sem geografia:|Dataset |varredura|carrego" 3
  if ($r.Codigo -eq 0) {
    Escrever "ok    $resumo"
  } elseif ($r.Codigo -eq 2) {
    # Codigo 2 e "carregou mas ficaram zonas sem geografia": nao e falha
    # total, mas e trabalho por rever e nao pode passar despercebido.
    Escrever "AVISO (codigo 2)  $resumo"
  } else {
    Escrever "ERRO (codigo $($r.Codigo))  $resumo"
    $falhou = $true
  }
} catch {
  Escrever "ERRO  $($_.Exception.Message)"
  $falhou = $true
}

# ---------------------------------------------------------------------
# A FILA DOS CODIGOS POSTAIS
# ---------------------------------------------------------------------
# Vai no mesmo trabalho de proposito. E a mesma preocupacao (manter a
# camada de dados alimentada) e uma tarefa e mais facil de acompanhar do
# que duas. Se o carregamento falhar, a fila corre na mesma: sao
# independentes, e a avaliacao seguinte precisa da area fina quer a
# varredura mensal tenha entrado quer nao.
#
# O script nao corre nada se a fila estiver vazia, por isso isto custa uma
# pergunta a base de dados nos dias em que ninguem pediu avaliacoes.
try {
  $f = CorrerNode "scripts\imo-cp-fila.mjs" "40"
  $resumoFila = Resumir $f.Saida "com area:|com área:|coordenadas:|Fila vazia|na fila|falhou|FALHOU|Falta|sem fonte" 2
  if ($f.Codigo -eq 0) {
    Escrever "fila  $resumoFila"
  } else {
    Escrever "fila AVISO (codigo $($f.Codigo))  $resumoFila"
  }
} catch {
  Escrever "fila ERRO  $($_.Exception.Message)"
}

if ($falhou) { exit 1 }
