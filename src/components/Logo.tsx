import { useState } from 'react'

// Shows the brand logo from /logo.png (drop the file in public/). Falls back to a
// "KH" monogram until an image is present.
export default function Logo({ size = 30 }: { size?: number }) {
  const [ok, setOk] = useState(true)
  if (ok) {
    return (
      <img
        className="logo logo-img"
        src={`${import.meta.env.BASE_URL}logo.jpg`}
        alt="Kyusi Hatakeros Tournament Hub"
        style={{ width: size, height: size }}
        onError={() => setOk(false)}
      />
    )
  }
  return <div className="logo" style={{ width: size, height: size }}>KH</div>
}
