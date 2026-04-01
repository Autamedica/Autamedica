export function mungeOpusSdp(sdp: string): string {
  // Encuentra la línea rtpmap para Opus, usualmente: a=rtpmap:111 opus/48000/2
  const lines = sdp.split('\r\n')
  let opusPayloadType = ''

  for (const line of lines) {
    if (line.startsWith('a=rtpmap:') && line.toLowerCase().includes('opus/48000')) {
      opusPayloadType = line.split(':')[1].split(' ')[0]
      break
    }
  }

  if (!opusPayloadType) return sdp

  // Busca si ya hay un fmtp para opus
  const fmtpPrefix = `a=fmtp:${opusPayloadType} `
  const fmtpIndex = lines.findIndex(line => line.startsWith(fmtpPrefix))

  if (fmtpIndex !== -1) {
    // Reemplaza o apendea
    let fmtpLine = lines[fmtpIndex]
    if (!fmtpLine.includes('useinbandfec')) fmtpLine += ';useinbandfec=1'
    if (!fmtpLine.includes('usedtx')) fmtpLine += ';usedtx=0'
    if (!fmtpLine.includes('maxaveragebitrate')) fmtpLine += ';maxaveragebitrate=32000'
    lines[fmtpIndex] = fmtpLine
  } else {
    // Inserta un nuevo fmtp debajo del rtpmap
    const rtpmapIndex = lines.findIndex(line => line.startsWith(`a=rtpmap:${opusPayloadType} `))
    if (rtpmapIndex !== -1) {
      lines.splice(rtpmapIndex + 1, 0, `${fmtpPrefix}useinbandfec=1;usedtx=0;maxaveragebitrate=32000`)
    }
  }

  return lines.join('\r\n')
}
