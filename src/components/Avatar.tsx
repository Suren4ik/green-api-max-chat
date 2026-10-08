const COLORS = ['#7b61ff', '#2d9cdb', '#27ae60', '#e67e22', '#e0457b', '#16a3a3']

export function Avatar({ name, seed }: { name: string; seed: string }) {
  const hash = [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const initial = name.replace(/^\+/, '').trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="avatar" style={{ background: COLORS[hash % COLORS.length] }}>
      {initial}
    </div>
  )
}
