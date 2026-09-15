export async function getHealth({ signal } = {}) {
  const response = await fetch('/api/v1/health/ready', { signal });
  if (!response.ok) throw new Error('Servicio no disponible');
  return response.json();
}
