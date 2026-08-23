# One-off icon generator — draws the UPInfradesk app icon with System.Drawing
# (no image libraries, no network). Re-run only if the mark ever changes.
Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$Size,
    [string]$OutPath,
    [switch]$Maskable
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = [System.Drawing.Color]::FromArgb(255, 0x6E, 0x34, 0x19)   # --accent-strong
  $fg = [System.Drawing.Color]::White

  $bgBrush = New-Object System.Drawing.SolidBrush($bg)

  if ($Maskable) {
    # Maskable: fill the FULL canvas edge-to-edge (OS applies its own mask/crop),
    # keep the glyph within the inner ~80% safe zone.
    $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)
  } else {
    $radius = [int]($Size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bgBrush, $path)
  }

  # Glyph: three horizontal bars (matches the in-app header mark), centered.
  $fgBrush = New-Object System.Drawing.SolidBrush($fg)
  $safe = if ($Maskable) { $Size * 0.30 } else { $Size * 0.22 }
  $usable = $Size - 2 * $safe
  $barHeight = $usable * 0.11
  $gap = $usable * 0.15
  $totalH = $barHeight * 3 + $gap * 2
  $startY = ($Size - $totalH) / 2
  $widths = @(0.62, 0.85, 1.0)
  for ($i = 0; $i -lt 3; $i++) {
    $w = $usable * $widths[$i]
    $x = $safe
    $y = $startY + $i * ($barHeight + $gap)
    $r = $barHeight / 2
    $rectPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dd = $r * 2
    $rectPath.AddArc($x, $y, $dd, $dd, 90, 180)
    $rectPath.AddArc($x + $w - $dd, $y, $dd, $dd, 270, 180)
    $rectPath.CloseFigure()
    $g.FillPath($fgBrush, $rectPath)
  }

  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$iconsDir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

New-Icon -Size 192 -OutPath (Join-Path $iconsDir "icon-192.png")
New-Icon -Size 512 -OutPath (Join-Path $iconsDir "icon-512.png")
New-Icon -Size 512 -OutPath (Join-Path $iconsDir "icon-maskable-512.png") -Maskable

Write-Output "Icons written to $iconsDir"
