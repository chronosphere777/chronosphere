import { useState } from 'preact/hooks';
import { useActivity, getCount } from '../hooks/useActivity';
import { UserCounter } from './UserCounter';

interface City {
  name: string;
  coords: [number, number];
}

interface CityModalProps {
  cities: City[];
  onSelectCity: (city: City) => void;
  onClose: () => void;
}

export function CityModal({ cities, onSelectCity, onClose }: CityModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Получаем статистику активных пользователей
  const { stats } = useActivity({ enabled: true });
  
  // Фильтруем города по поисковому запросу
  const filteredCities = searchQuery
    ? cities.filter(city => city.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : cities;
  
  // Группируем города по первой букве
  const citiesByLetter = filteredCities.reduce((acc, city) => {
    const firstLetter = city.name[0].toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(city);
    return acc;
  }, {} as Record<string, City[]>);

  // Получаем отсортированный список букв
  const letters = Object.keys(citiesByLetter).sort();

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(5px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '20px',
          padding: '30px',
          boxShadow: '0 0 40px rgba(255, 255, 255, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        {/* Заголовок */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <h2 style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: '400',
            margin: 0,
            textShadow: '0 0 15px rgba(255, 255, 255, 0.8)'
          }}>
            Выберите город
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '2px solid white',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              lineHeight: '1'
            }}
          >
            ×
          </button>
        </div>

        {/* Поиск городов */}
        <input
          type="text"
          placeholder="Поиск города..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.15)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '16px',
            outline: 'none',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.3s ease'
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
          }}
        />

        {/* Список городов по алфавиту */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '10px 0'
        }}>
          {letters.map(letter => (
            <div key={letter}>
              {/* Буква-заголовок */}
              <div style={{
                color: '#fff',
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '8px',
                textShadow: '0 0 10px rgba(255, 255, 255, 0.6)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                paddingBottom: '4px'
              }}>
                {letter}
              </div>
              
              {/* Города под этой буквой */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {citiesByLetter[letter].map(city => {
                  const cityUserCount = getCount(stats, 'city', city.name);
                  
                  return (
                    <button
                      key={city.name}
                      onClick={() => {
                        onSelectCity(city);
                        onClose();
                      }}
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '16px',
                        fontWeight: '300',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        target.style.background = 'rgba(255, 255, 255, 0.15)';
                        target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        target.style.background = 'rgba(255, 255, 255, 0.08)';
                        target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                    >
                      <span>{city.name}</span>
                      <UserCounter count={cityUserCount} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
