import { Link } from 'react-router-dom'
import logoUrl from '../assets/logo.jpg'

function BrandLogo({ to = '/', panel = 'English Institute', className = '' }) {
  return (
    <Link className={`brand ${className}`.trim()} to={to}>
      <img className="brand-logo" src={logoUrl} alt="Innova-T English Institute" />
      <span>
        <strong>Innova-T</strong>
        <small>{panel}</small>
      </span>
    </Link>
  )
}

export default BrandLogo
