// Компонент счетчика активных пользователей

interface UserCounterProps {
  count: number;
  style?: Record<string, string | number>;
}

export function UserCounter({ count, style }: UserCounterProps) {
  if (count === 0) return null;
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      background: 'rgba(240, 248, 255, 0.15)',
      border: '1px solid rgba(240, 248, 255, 0.4)',
      borderRadius: '10px',
      fontSize: '11px',
      color: '#f0f8ff',
      fontWeight: 'bold',
      marginLeft: '6px',
      ...style
    }}>
      <span>👤</span>
      <span>{count}</span>
    </div>
  );
}

// HTML версия для innerHTML (используется в MapView)
export function getUserCounterHTML(count: number): string {
  if (count === 0) return '';
  
  return `
    <span style="
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background: rgba(240, 248, 255, 0.15);
      border: 1px solid rgba(240, 248, 255, 0.4);
      border-radius: 10px;
      font-size: 11px;
      color: #f0f8ff;
      font-weight: bold;
      margin-left: 6px;
    ">
      <span>👤</span>
      <span>${count}</span>
    </span>
  `;
}
