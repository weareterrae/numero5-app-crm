# Regista a tarefa que vigia a pasta do SIR.
#
#   powershell -ExecutionPolicy Bypass -File scripts\imo-sir-agendar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\imo-sir-agendar.ps1 -Remover
#
# DE HORA A HORA, E PORQUÊ
#
# A vigia verifica o hash de cada ficheiro ANTES de abrir o PDF, por isso
# uma corrida sem novidades custa a leitura de meia dúzia de ficheiros e
# uma pergunta à base de dados. De hora a hora não pesa, e larga-se um
# relatório na pasta sabendo que dentro de uma hora está lá dentro.
#
# Também corre ao iniciar sessão: se o computador esteve desligado, a
# primeira coisa que faz ao voltar é pôr-se em dia.
#
# NÃO PRECISA DE ADMINISTRADOR. A tarefa corre com a conta de quem a
# regista e só quando essa sessão está iniciada — tem de ser, porque a
# pasta está no OneDrive do utilizador e as credenciais também.
param([switch]$Remover)

$ErrorActionPreference = "Stop"
$NOME = "N5 - SIR - importar relatorios"
$repo = Split-Path -Parent $PSScriptRoot

if ($Remover) {
  Unregister-ScheduledTask -TaskName $NOME -Confirm:$false
  Write-Host "Tarefa removida. A pasta deixa de ser vigiada."
  exit 0
}

$accao = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repo\scripts\imo-sir-correr.ps1`"" `
  -WorkingDirectory $repo

$aoEntrar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$deHoraEmHora = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Hours 1)

# StartWhenAvailable: se o portátil estava fechado à hora certa, corre
# quando abrir, em vez de saltar a vez e esperar pela hora seguinte.
$opcoes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $NOME -Force `
  -Action $accao -Trigger $aoEntrar, $deHoraEmHora -Settings $opcoes `
  -Description "Le os relatorios SIR largados na pasta e importa os benchmarks. Ver scripts/imo-vigiar-pasta-sir.mts" | Out-Null

Write-Host "Tarefa registada: $NOME"
Write-Host "  de hora a hora, e ao iniciar sessao"
Write-Host "  registo em: <pasta do SIR>\_registo-da-importacao.txt"
Write-Host ""
Write-Host "Para correr ja:   Start-ScheduledTask -TaskName '$NOME'"
Write-Host "Para remover:     powershell -ExecutionPolicy Bypass -File scripts\imo-sir-agendar.ps1 -Remover"
