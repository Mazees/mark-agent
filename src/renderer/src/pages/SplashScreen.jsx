import icon from '../assets/icon.svg'

const SplashScreen = () => {
  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <img src={icon} alt="Mark Icon" className="w-32 h-32 animate-pulse" />
    </div>
  )
}

export default SplashScreen
