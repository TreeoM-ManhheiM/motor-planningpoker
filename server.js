<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planning Poker Lógico</title>
  <style>
    body {
      margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #0f172a; color: white; text-align: center;
    }
    #lobby, #painel-poker { max-width: 900px; margin: auto; padding: 20px; }
    
    .mesa-votos {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 20px;
      background: #1e293b; padding: 30px; border-radius: 15px;
      min-height: 150px; margin: 20px 0; border: 2px dashed #475569;
    }
    
    .carta {
      width: 70px; height: 110px; background: #f8fafc; color: #1e293b;
      border-radius: 10px; font-weight: bold; font-size: 24px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3); user-select: none; transition: all 0.2s;
    }
    
    .carta.oculta {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: white; border: 3px solid #ffffff;
    }
    .carta.oculta::after { content: "❓"; font-size: 20px; }

    .meu-baralho { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 30px; }
    .meu-baralho .carta { cursor: pointer; }
    .meu-baralho .carta:hover { transform: translateY(-10px); background: #e2e8f0; }
    .meu-baralho .carta.selecionada {
      background: #fbbf24; color: #1e293b; transform: translateY(-15px);
      box-shadow: 0 0 15px #fbbf24;
    }

    .status-voto { font-size: 14px; margin-top: 8px; color: #94a3b8; font-weight: bold; }
    .player-card { display: flex; flex-direction: column; align-items: center; }

    button {
      background: #3b82f6; color: white; border: none; padding: 12px 24px;
      border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; margin: 5px;
    }
    button:hover { background: #2563eb; }
    .btn-revelar { background: #10b981; }
    .btn-revelar:hover { background: #059669; }
    .btn-reset { background: #ef4444; }
    .btn-reset:hover { background: #dc2626; }

    #estatisticas {
      background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981;
      padding: 15px; border-radius: 10px; display: none; font-size: 18px; margin: 15px 0;
    }
    input { padding: 12px; border-radius: 8px; border: none; margin: 5px; width: 200px; font-size: 16px; }
  </style>
</head>
<body>

  <div id="lobby">
    <h1 style="color: #60a5fa; font-size: 36px;">Planning Poker Lógico 🃏</h1>
    <p>O professor lerá o desafio. Votem e cliquem em revelar quando estiverem prontos!</p>
    <br>
    <input type="text" id="nick" placeholder="Seu Nome/Apelido">
    <input type="text" id="sala" placeholder="Nome da Sala (ex: Squad-A)">
    <br><br>
    <button onclick="entrar()">ENTRAR NA SALA</button>
  </div>

  <div id="painel-poker" style="display: none;">
    <h2 id="titulo-sala" style="color: #60a5fa; margin-bottom: 5px;">Sala: -</h2>
    <p id="instrucao" style="color: #94a3b8; margin-top: 0;">Escolha uma carta e depois clique em "Revelar Votos".</p>

    <div>
      <button class="btn-revelar" onclick="socket.emit('revelarVotos')">👁️ Revelar Votos</button>
      <button class="btn-reset" onclick="socket.emit('reiniciarRodada')">🔄 Nova Rodada</button>
    </div>

    <div id="estatisticas"></div>

    <h3>Mesa de Estimativas</h3>
    <div class="mesa-votos" id="mesa"></div>

    <h3>Seu Baralho (Fibonacci)</h3>
    <div class="meu-baralho" id="meu-baralho"></div>
  </div>

  <script src="https://cdn.socket.io/4.8.3/socket.io.min.js"></script>
  <script>
    const socket = io("https://motor-planningpoker.onrender.com", {
      transports: ["polling"],
      upgrade: true
    });

    const cartasFibonacci = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'];
    let meuVoto = null;
    let salaRevelada = false;

    function entrar() {
      const apelido = document.getElementById('nick').value;
      const sala = document.getElementById('sala').value || "Geral";
      if (!apelido) return alert("Por favor, digite seu nome!");

      socket.emit('entrarSala', { apelido, sala });
      
      document.getElementById('lobby').style.display = 'none';
      document.getElementById('painel-poker').style.display = 'block';
      document.getElementById('titulo-sala').innerText = `Sala: ${sala}`;
      
      gerarMeuBaralho();
    }

    function gerarMeuBaralho() {
      const container = document.getElementById('meu-baralho');
      container.innerHTML = cartasFibonacci.map(v => `
        <div class="carta" id="my-card-${v}" onclick="votar('${v}')">${v}</div>
      `).join('');
    }

    function votar(valor) {
      if (salaRevelada) return alert("A rodada acabou! Inicie uma nova rodada para votar de novo.");
      
      const cartas = document.querySelectorAll('.meu-baralho .carta');
      cartas.forEach(c => c.classList.remove('selecionada'));

      if (meuVoto === valor) {
        meuVoto = null; 
      } else {
        meuVoto = valor;
        document.getElementById(`my-card-${valor}`).classList.add('selecionada');
      }

      socket.emit('votar', valor);
    }

    function renderizarMesa(sala) {
      salaRevelada = sala.revelado;
      const mesa = document.getElementById('mesa');
      
      mesa.innerHTML = sala.jogadores.map(j => {
        let classeCarta = "carta";
        let conteudoCarta = j.voto || "";
        let statusTexto = j.voto ? '✅ Votou' : '⏳ Pensando...';
        let corStatus = j.voto ? '#10b981' : '#94a3b8';

        if (j.voto && !sala.revelado) {
          classeCarta = "carta oculta";
          conteudoCarta = "";
        } else if (!j.voto) {
          classeCarta = "carta";
          conteudoCarta = "💤"; 
        }

        // Se o jogador clicou em revelar mas a mesa ainda não abriu geral
        if (j.prontoParaRevelar && !sala.revelado) {
            statusTexto = '👁️ Quer Revelar';
            corStatus = '#6366f1';
        }

        return `
          <div class="player-card">
            <div class="${classeCarta}">${conteudoCarta}</div>
            <div style="font-weight: bold; margin-top: 10px;">${j.nome}</div>
            <div class="status-voto" style="color: ${corStatus};">${statusTexto}</div>
          </div>
        `;
      }).join('');
    }

    socket.on('atualizarSala', (sala) => {
      document.getElementById('estatisticas').style.display = 'none';
      renderizarMesa(sala);
    });

    socket.on('votosRevelados', ({ sala, stats }) => {
      renderizarMesa(sala);
      
      const painelStats = document.getElementById('estatisticas');
      painelStats.style.display = 'block';
      
      if (stats.consenso) {
        painelStats.innerHTML = `🎉 <strong>Consenso Atingido!</strong> Todos votaram igual! Estimativa: <strong>${stats.media}</strong>`;
        painelStats.style.borderColor = "#10b981";
        painelStats.style.background = "rgba(16, 185, 129, 0.15)";
      } else {
        painelStats.innerHTML = `📊 Votos revelados! Média calculada: <strong>${stats.media}</strong> pontos. <br> <small>Discutam as diferenças antes de reiniciar!</small>`;
        painelStats.style.borderColor = "#fbbf24";
        painelStats.style.background = "rgba(251, 191, 36, 0.15)";
      }
    });

    socket.on('rodadaReiniciada', (sala) => {
      meuVoto = null;
      document.getElementById('estatisticas').style.display = 'none';
      gerarMeuBaralho(); 
      renderizarMesa(sala);
    });
  </script>
</body>
</html>
