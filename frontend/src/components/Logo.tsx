// Restaurant logo. The source image has a paper border around the round badge,
// so it is zoomed slightly and clipped to a circle.
export const RESTO_NAME = "Brahmins' Thatte Idli"
import logo from '../assets/brahmins-thatte-idli.png'

export const RESTO_LOGO = logo

export default function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full bg-[#5a1a1f] ring-2 ring-[#d9a441]/60 ${className}`} style={{ width: size, height: size }}>
      <img src={RESTO_LOGO} alt={`${RESTO_NAME} logo`} className="h-full w-full scale-[1.19] object-cover" />
    </span>
  )
}
