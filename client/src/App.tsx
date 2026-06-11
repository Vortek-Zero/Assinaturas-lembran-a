import React, { useRef, useState, useEffect } from 'react';
import './App.css';

const API = '';

function getDeviceId(): string {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}

function App() {
  const [view, setView] = useState<'form' | 'list' | 'admin'>('form');
  const [devMode, setDevMode] = useState(false);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'draw' | 'photo'>('draw');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (view === 'form' && mode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2.5;
        contextRef.current = ctx;
      }
    }
  }, [view, mode]);

  useEffect(() => {
    (window as any).enableDevMode = () => setDevMode(true);
    (window as any).disableDevMode = () => setDevMode(false);
    return () => {
      delete (window as any).enableDevMode;
      delete (window as any).disableDevMode;
    };
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    const pos = getPos(e);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(pos.x, pos.y);

    if (e.cancelable) e.preventDefault();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const pos = getPos(e);
    contextRef.current?.lineTo(pos.x, pos.y);
    contextRef.current?.stroke();

    if (e.cancelable) e.preventDefault();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    contextRef.current?.closePath();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const fetchSignatures = async () => {
    try {
      const response = await fetch(`${API}/api/signatures`);
      if (response.ok) {
        const data = await response.json();
        setSignatures(data.reverse());
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDownloadImage = async (imageUrl: string, name: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar imagem.');
    }
  };

  const handleDownloadAll = async () => {
    try {
      const response = await fetch(`${API}/api/admin/download-all`);
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Erro ao baixar.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'assinaturas.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar assinaturas.');
    }
  };

  const handleDelete = async (id: string) => {
    const pw = prompt('Digite a senha de 4 dígitos para excluir:');
    if (!pw || !/^\d{4}$/.test(pw)) return;
    try {
      const response = await fetch(`${API}/api/signature/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      if (response.ok) {
        setSignatures(prev => prev.filter(s => s.id !== id));
      } else {
        const data = await response.json();
        alert(data.error || 'Erro ao excluir.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro de conexão.');
    }
  };

  useEffect(() => {
    if (view === 'list' || view === 'admin') fetchSignatures();
  }, [view]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Informe seu nome.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      let body;
      let headers: any = {};

      const deviceId = getDeviceId();

      if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const drawImage = canvas.toDataURL('image/png');
        body = JSON.stringify({ name: name.trim(), drawImage, deviceId, password });
        headers['Content-Type'] = 'application/json';
      } else {
        if (!photo) {
          alert('Selecione uma foto.');
          setLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('photo', photo);
        formData.append('deviceId', deviceId);
        formData.append('password', password);
        body = formData;
      }

      const response = await fetch(`${API}/api/signature`, {
        method: 'POST',
        headers,
        body
      });

      if (response.status === 409) {
        const data = await response.json();
        setMessage(`⚠️ ${data.error}`);
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error('Falha ao salvar');

      setMessage('Assinatura salva com sucesso!');
      setName('');
      setPassword('');
      setPhoto(null);
      clearCanvas();
      setTimeout(() => setView('list'), 1500);
    } catch (error) {
      console.error(error);
      setMessage('Erro ao salvar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Assinaturas</h1>
      </header>

      <div className="view-selector">
        <button className={`nav-btn ${view === 'form' ? 'active' : ''}`} onClick={() => setView('form')}>✍️ Assinar</button>
        <button className={`nav-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>📁 Ver Todas</button>
        {devMode && (
          <button className={`nav-btn admin-btn ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>🔧 Admin</button>
        )}
      </div>

      {view === 'form' ? (
        <div className="card">
          <div className="input-group">
            <label>Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="input-group">
            <label>Senha (4 dígitos) — necessária para excluir a assinatura</label>
            <input type="password" inputMode="numeric" maxLength={4} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="****" />
          </div>

          <div className="mode-selector">
            <button className={`mode-btn ${mode === 'draw' ? 'active' : ''}`} onClick={() => setMode('draw')}>Desenhar</button>
            <button className={`mode-btn ${mode === 'photo' ? 'active' : ''}`} onClick={() => setMode('photo')}>Foto</button>
          </div>

          {mode === 'draw' ? (
            <>
              <div className="canvas-wrapper">
                <div className="canvas-container">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <button className="clear-btn" onClick={clearCanvas}>Limpar</button>
              </div>
              <p className="hint">Desenhe sua assinatura no quadro acima usando o mouse ou o dedo</p>
            </>
          ) : (
            <>
              <div className="photo-input-container" onClick={() => document.getElementById('cam')?.click()}>
                <input id="cam" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                <span>{photo ? '✅ Foto selecionada' : '📸 Clique para capturar ou enviar foto'}</span>
              </div>
              <p className="hint">📌 Tire uma foto da sua <strong>assinatura</strong> (no papel), não uma selfie</p>
            </>
          )}

          <button className="submit-btn" onClick={handleSubmit} disabled={loading || !name.trim()}>
            {loading ? 'Salvando...' : 'Finalizar'}
          </button>
          {message && <div className="status-msg">{message}</div>}
        </div>
      ) : view === 'admin' ? (
        <div className="card admin-panel">
          <div className="admin-header">
            <h2>Painel Administrativo</h2>
            <button className="download-all-btn" onClick={handleDownloadAll}>
              📦 Download ZIP
            </button>
          </div>
          {signatures.length === 0 ? (
            <p className="empty-state">Nenhuma assinatura cadastrada.</p>
          ) : (
            <div className="admin-list">
              {signatures.map(s => (
                <div key={s.id} className="admin-item">
                  <div className="admin-item-info">
                    <span className="admin-item-name">{s.name}</span>
                    <span className="admin-item-date">{s.timestamp}</span>
                    <span className="admin-item-type">{s.type === 'draw' ? '✏️' : '📸'}</span>
                  </div>
                  <button className="admin-download-btn" onClick={() => handleDownloadImage(s.image_url, s.name)} title="Baixar imagem">
                    ⬇️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="signatures-list">
          {signatures.length === 0 ? <p className="empty-state">Nenhuma assinatura encontrada.</p> :
            signatures.map(s => (
              <div key={s.id} className="signature-item">
                <div className="signature-info">
                  <p className="signature-name">{s.name}</p>
                  <span className="signature-date">{s.timestamp}</span>
                  <button className="delete-btn" onClick={() => handleDelete(s.id)}>Excluir</button>
                </div>
                <div className="signature-image-container">
                  <img src={s.image_url} className="signature-image" alt="assinatura" />
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

export default App;
