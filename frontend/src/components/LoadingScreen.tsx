import { useEffect } from 'preact/hooks';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  useEffect(() => {
    // Через 5 секунд вызываем onComplete
    const timer = setTimeout(() => {
      onComplete();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="loading-screen">
      <img src="/chronosphere/logo.png" alt="" className="loading-logo" />
    </div>
  );
}
