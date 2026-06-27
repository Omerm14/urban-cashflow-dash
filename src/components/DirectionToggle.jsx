import { useState, useEffect } from 'react';

export default function DirectionToggle() {
  const [dir, setDir] = useState(() => {
    return localStorage.getItem('cashflow-dir') || 'b';
  });

  useEffect(() => {
    document.documentElement.classList.remove('dir-a', 'dir-b');
    document.documentElement.classList.add(`dir-${dir}`);
    localStorage.setItem('cashflow-dir', dir);
  }, [dir]);

  return (
    <div className="dir-toggle" title="Switch visual direction">
      <button className={`dir-btn${dir === 'a' ? ' active' : ''}`} onClick={() => setDir('a')}>A</button>
      <button className={`dir-btn${dir === 'b' ? ' active' : ''}`} onClick={() => setDir('b')}>B</button>
    </div>
  );
}
