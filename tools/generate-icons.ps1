# One-off icon generator — draws the UPInfradesk app icon with System.Drawing
# (no image libraries, no network). Re-run only if the mark ever changes.
#
# The mark: a desk edge with three routes of decreasing length rising from it,
# and a node on the shortest — the index, and the infrastructure it points at.
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

  $top    = [System.Drawing.Color]::FromArgb(255, 0x8C, 0x43, 0x21)   # --accent
  $bottom = [System.Drawing.Color]::FromArgb(255, 0x5E, 0x2B, 0x14)   # deeper umber
  $fg     = [System.Drawing.Color]::White

  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect, $top, $bottom, 150.0)

  if ($Maskable) {
    # Maskable: fill edge to edge; the OS applies its own mask.
    $g.FillRectangle($grad, 0, 0, $Size, $Size)
  } else {
    $radius = [int]($Size * 0.23)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($grad, $path)
  }

  # Glyph geometry mirrors the 32x32 SVG in index.html, scaled to this canvas.
  # Maskable art stays inside the inner ~80% safe zone.
  $scale = if ($Maskable) { $Size / 32.0 * 0.78 } else { $Size / 32.0 * 0.94 }
  $offX = ($Size - 32.0 * $scale) / 2.0
  $offY = ($Size - 32.0 * $scale) / 2.0
  function P([double]$x, [double]$y) {
    New-Object System.Drawing.PointF(($offX + $x * $scale), ($offY + $y * $scale))
  }

  $strokeW = 2.6 * $scale
  $bars = @(
    @{ x1 = 5.0; x2 = 27.0; y = 24.0; alpha = 242 },
    @{ x1 = 7.0; x2 = 20.0; y = 18.5; alpha = 180 },
    @{ x1 = 7.0; x2 = 15.0; y = 13.0; alpha = 115 }
  )
  foreach ($b in $bars) {
    $c = [System.Drawing.Color]::FromArgb($b.alpha, $fg.R, $fg.G, $fg.B)
    $pen = New-Object System.Drawing.Pen($c, $strokeW)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($pen, (P $b.x1 $b.y), (P $b.x2 $b.y))
    $pen.Dispose()
  }

  # The node on the shortest route.
  $nodePen = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(242, $fg.R, $fg.G, $fg.B), (2.4 * $scale))
  $r = 3.1 * $scale
  $cx = $offX + 24.5 * $scale
  $cy = $offY + 13.0 * $scale
  $g.DrawEllipse($nodePen, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
  $nodePen.Dispose()

  $grad.Dispose()
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
