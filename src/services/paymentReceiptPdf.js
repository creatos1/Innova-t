const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
}

function escapePdfText(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(Number(value || 0))
}

function formatReceiptDate(value = new Date()) {
  const date = value instanceof Date
    ? value
    : typeof value?.toDate === 'function'
      ? value.toDate()
      : new Date(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(Number.isNaN(date.getTime()) ? new Date() : date)
}

function textLine(text, x, y, size = 12, font = 'F1') {
  return `0 0 0 rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`
}

function getImageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = reject
    image.src = src
  })
}

function makePdfBlob({ contentStream, logoBytes, logoWidth, logoHeight }) {
  const encoder = new TextEncoder()
  const chunks = []
  const offsets = [0]
  let position = 0

  function pushString(value) {
    const bytes = encoder.encode(value)
    chunks.push(bytes)
    position += bytes.length
  }

  function pushBytes(bytes) {
    chunks.push(bytes)
    position += bytes.length
  }

  function startObject(id) {
    offsets[id] = position
    pushString(`${id} 0 obj\n`)
  }

  pushString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  startObject(1)
  pushString('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  startObject(2)
  pushString('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  startObject(3)
  pushString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Logo 4 0 R >> >> /Contents 7 0 R >>\nendobj\n`)

  startObject(4)
  pushString(`<< /Type /XObject /Subtype /Image /Width ${logoWidth} /Height ${logoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`)
  pushBytes(logoBytes)
  pushString('\nendstream\nendobj\n')

  startObject(5)
  pushString('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')

  startObject(6)
  pushString('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n')

  const contentBytes = encoder.encode(contentStream)
  startObject(7)
  pushString(`<< /Length ${contentBytes.length} >>\nstream\n`)
  pushBytes(contentBytes)
  pushString('\nendstream\nendobj\n')

  const xrefOffset = position
  pushString(`xref\n0 8\n0000000000 65535 f \n`)
  for (let id = 1; id <= 7; id += 1) {
    pushString(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  pushString(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return new Blob(chunks, { type: 'application/pdf' })
}

export async function downloadPaymentReceipt({ student, payment }) {
  const logoResponse = await fetch('/logo.jpg')
  const logoBuffer = await logoResponse.arrayBuffer()
  const logoBytes = new Uint8Array(logoBuffer)
  const logoSize = await getImageSize('/logo.jpg')
  const period = payment.period || payment.monthLabel || 'Periodo registrado'
  const dueDate = payment.dueDate || '-'
  const paidAt = payment.paidAt ? formatReceiptDate(payment.paidAt) : formatReceiptDate()
  const amount = formatCurrency(payment.amount)
  const fileSafeId = cleanText(student.publicId || student.id || 'alumno').replace(/[^a-zA-Z0-9-]+/g, '-')

  const content = [
    'q 80 0 0 80 52 660 cm /Logo Do Q',
    textLine('Innova-T English Institute', 150, 724, 20, 'F2'),
    textLine('Recibo de pago', 150, 696, 15, 'F2'),
    '0.78 0.61 0.24 rg 48 628 516 2 re f',
    textLine(`Alumno: ${student.fullName || '-'}`, 58, 590, 13, 'F2'),
    textLine(`ID: ${student.publicId || student.id || '-'}`, 58, 565, 12),
    textLine(`Periodo: ${period}`, 58, 525, 12),
    textLine(`Fecha limite: ${dueDate}`, 58, 500, 12),
    textLine(`Monto pagado: ${amount}`, 58, 465, 18, 'F2'),
    textLine(`Fecha de emision: ${paidAt}`, 58, 430, 12),
    textLine('Este recibo confirma el registro del pago en el sistema administrativo.', 58, 365, 11),
    textLine('Este documento no es un comprobante fiscal y no sirve para facturar.', 58, 340, 10, 'F2'),
    textLine('Gracias por formar parte de Innova-T English Institute.', 58, 316, 11, 'F2'),
    '0.94 0.89 0.80 rg 48 92 516 1 re f',
    textLine('Contacto: +52 449 312 5789', 58, 70, 10)
  ].join('\n')

  const pdfBlob = makePdfBlob({
    contentStream: content,
    logoBytes,
    logoWidth: logoSize.width,
    logoHeight: logoSize.height
  })
  const url = URL.createObjectURL(pdfBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `recibo-${fileSafeId}-${cleanText(period).replace(/[^a-zA-Z0-9-]+/g, '-')}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
