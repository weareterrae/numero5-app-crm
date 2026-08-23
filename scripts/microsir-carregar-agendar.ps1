# Regista a tarefa que traz a colheita do MicroSIR para o Supabase.
#
#   powershell -ExecutionPolicy Bypass -File scripts\microsir-carregar-agendar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\microsir-carregar-agendar.ps1 -Remover
#
# DUAS METADES, EM SITIOS DIFERENTES
#
# A COLHEITA corre no Apify, dia 3 de cada mes as 04:00 — na nuvem, porque
# o portatil pode estar desligado nesse dia. Ver
# scripts/microsir-agendar-apify.mjs.
#
# O CARREGAMENTO corre aqui, porque as credenciais do Supabase sao locais.
# Diariamente, nao mensalmente: e idempotente, custa dois pedidos, e assim
# um dia falhado cura-se no dia seguinte em vez de esperar um mes.
#
# NAO PRECISA DE ADMINISTRADOR: corre com a conta de quem a regista.
param([switch]$Remover)

$ErrorActionPreference = "Stop"
$NOME = "N5 - MicroSIR - carregar benchmarks"
$repo = Split-Path -Parent $PSScriptRoot

if ($Remover) {
  Unregister-ScheduledTask -TaskName $NOME -Confirm:$false
  Write-Host "Tarefa removida. Os benchmarks do MicroSIR deixam de ser atualizados."
  exit 0
}

$accao = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repo\scripts\microsir-carregar-correr.ps1`"" `
  -WorkingDirectory $repo

# 09:00: a colheita do dia 3 comeca as 04:00 e demora 4 minutos. Cinco
# horas de folga chegam para qualquer atraso do lado deles.
$diario = New-ScheduledTaskTrigger -Daily -At "09:00"
$aoEntrar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$opcoes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $NOME -Force `
  -Action $accao -Trigger $diario, $aoEntrar -Settings $opcoes `
  -Description "Traz a ultima colheita boa do Actor microsir para imo_benchmarks. Ver scripts/imo-carregar-microsir.mjs" | Out-Null

Write-Host "Tarefa registada: $NOME"
Write-Host "  diariamente as 09:00, e ao iniciar sessao"
Write-Host "  colheita no Apify: dia 3 de cada mes as 04:00"
Write-Host "  registo em: scripts\_registo-microsir.txt"
Write-Host ""
Write-Host "Para correr ja:   Start-ScheduledTask -TaskName '$NOME'"
Write-Host "Para remover:     powershell -ExecutionPolicy Bypass -File scripts\microsir-carregar-agendar.ps1 -Remover"
