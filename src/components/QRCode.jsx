/**
 * h173k Burn Chat - QR Code generator (white modules on transparent bg)
 */
import React, { useState, useEffect, useRef } from 'react'

export function QRCodeGenerator({ data, size = 200, errorCorrectionLevel = 'M', className = '' }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!data || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const QRCodeLib = await import('qrcode')
        const QRCode = QRCodeLib.default || QRCodeLib
        if (cancelled || !canvasRef.current) return
        await QRCode.toCanvas(canvasRef.current, data, {
          width: size,
          margin: 2,
          color: { dark: '#ffffff', light: '#00000000' },
          errorCorrectionLevel,
        })
      } catch (err) {
        console.error('QR generation error:', err)
        if (!cancelled) setError('Failed to generate QR code')
      }
    })()
    return () => { cancelled = true }
  }, [data, size, errorCorrectionLevel])

  if (error) return <div className="qr-error">{error}</div>
  return (
    <div className={`qr-code-container ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  )
}
