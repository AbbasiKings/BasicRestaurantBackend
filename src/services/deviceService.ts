import { Request } from 'express';

export function parseDeviceName(req: Request): string {
  const ua = req.headers['user-agent'] || '';

  let os = 'Unknown OS';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11 PC';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7 PC';
  else if (ua.includes('Windows NT')) os = 'Windows PC';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'Mac OS PC';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux PC';
  else if (ua.includes('Android')) os = 'Android Device';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS Device';

  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  return `${os} (${browser})`;
}
