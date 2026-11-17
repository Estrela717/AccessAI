param([string]$ManifestPath, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
[void][Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq 'Microsoft Huihui' } | Select-Object -First 1
$synth.Options.SpeakingRate = 1.25
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($section in $manifest.sections) {
  $operation = $synth.SynthesizeTextToStreamAsync($section.narration)
  $task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($operation))
  $task.Wait()
  $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($task.Result)
  $target = Join-Path $OutputDirectory ($section.id + '.wav')
  $fileStream = [System.IO.File]::Create($target)
  try { $stream.CopyTo($fileStream) } finally { $fileStream.Dispose(); $stream.Dispose() }
  Write-Output ('VOICE ' + $section.id)
}
$synth.Dispose()
