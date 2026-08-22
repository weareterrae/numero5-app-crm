# Regista a tarefa que corre a bateria de qualidade todos os dias.
#
#   powershell -ExecutionPolicy Bypass -File scripts\ai-qualidade-agendar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\ai-qualidade-agendar.ps1 -Remover
#
# UMA VEZ POR DIA, E PORQUÊ ESSA CADÊNCIA
#
# Isto custa dinheiro: 42 chamadas a modelos por corrida. E mede
# TENDÊNCIA, não disponibilidade — para saber se um assistente está de
# pé há os vigias, que correm de minutos a minutos e não custam nada.
#
# Uma nota isolada é ruidosa: o mesmo juiz deu 5 e 0 à mesma situação com
# vinte minutos de intervalo. O que torna isto útil é a REPETIÇÃO — uma
# pergunta que falha dois dias seguidos é um defeito; um dia é ruído.
# Daí ser diário, e não de hora a hora.
#
# ÀS 07:00, antes de o dia começar. Se houver uma nota má, aparece no
# registo antes de alguém mexer em alguma coisa — e assim sabe-se que
# não foi do que se mexeu hoje.
param([switch]$Remover)

$ErrorActionPreference = "Stop"
$NOME = "N5 - Qualidade dos assistentes"
$repo = Split-Path -Parent $PSScriptRoot

if ($Remover) {
  Unregister-ScheduledTask -TaskName $NOME -Confirm:$false
  Write-Host "Tarefa removida. A bateria deixa de correr sozinha."
  exit 0
}

$accao = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repo\scripts\ai-qualidade-correr.ps1`"" `
  -WorkingDirectory $repo

$diario = New-ScheduledTaskTrigger -Daily -At 07:00

# StartWhenAvailable: se o computador esteve desligado às 07:00, corre
# quando ligar. Uma bateria que salta o dia por causa de um portátil
# fechado deixa de servir para medir tendência.
$opcoes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $NOME -Force `
  -Action $accao -Trigger $diario -Settings $opcoes `
  -Description "Corre as perguntas de referencia contra os assistentes reais e regista as notas baixas. Ver scripts/ai-qualidade-correr.ps1" | Out-Null

Write-Host "Tarefa registada: $NOME"
Write-Host "  todos os dias as 07:00"
Write-Host "  so escreve quando ha nota baixa: scripts\_registo-qualidade.txt"
Write-Host ""
Write-Host "Para correr ja:  Start-ScheduledTask -TaskName '$NOME'"
Write-Host "Para remover:    powershell -ExecutionPolicy Bypass -File scripts\ai-qualidade-agendar.ps1 -Remover"
