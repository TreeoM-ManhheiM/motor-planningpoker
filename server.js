const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Habilita o CORS para aceitar conexões do seu site no GitHub Pages
const io = new Server(server, { cors: { origin: "*" } });

// Armazena o estado de todas as salas
let salas = {};

io.on('connection', (socket) => {
    let minhaSala = null;

    // 1. Jogador entra na sala
    socket.on('entrarSala', ({ apelido, sala }) => {
        socket.join(sala);
        minhaSala = sala;
        
        // Se a sala não existir, cria uma nova
        if (!salas[sala]) {
            salas[sala] = { jogadores: [], revelado: false };
        }
        
        // Evita duplicidade se o mesmo jogador atualizar a página
        salas[sala].jogadores = salas[sala].jogadores.filter(j => j.id !== socket.id);
        
        // Adiciona o jogador
        salas[sala].jogadores.push({ id: socket.id, nome: apelido, voto: null });
        
        // Atualiza a mesa para todos na sala
        io.to(sala).emit('atualizarSala', salas[sala]);
    });

    // 2. Jogador escolhe uma carta
    socket.on('votar', (voto) => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        // Bloqueia voto se a mesa já foi revelada
        if (sala.revelado) return;

        let jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            // Se clicar na mesma carta, ele tira o voto. Se for nova, ele vota.
            jogador.voto = (jogador.voto === voto) ? null : voto;
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 3. Professor/Líder clica em Revelar Votos
    socket.on('revelarVotos', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        sala.revelado = true;
        
        // Separar apenas os votos numéricos para calcular a média (ignora '?' e '☕')
        let votosValidos = sala.jogadores
            .map(j => j.voto)
            .filter(v => v !== null && v !== '?' && v !== '☕')
            .map(Number);
            
        let stats = { media: 0, consenso: false };
        
        if (votosValidos.length > 0) {
            let soma = votosValidos.reduce((a, b) => a + b, 0);
            stats.media = (soma / votosValidos.length).toFixed(1);
            
            // Verifica se todos votaram no mesmo número
            let primeiroVoto = votosValidos[0];
            stats.consenso = votosValidos.every(v => v === primeiroVoto);
        }

        io.to(minhaSala).emit('votosRevelados', { sala, stats });
    });

    // 4. Professor/Líder clica em Nova Rodada
    socket.on('reiniciarRodada', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        sala.revelado = false;
        
        // Zera os votos de todos
        sala.jogadores.forEach(j => j.voto = null);
        
        io.to(minhaSala).emit('rodadaReiniciada', sala);
    });

    // 5. Jogador fecha a aba ou cai a internet
    socket.on('disconnect', () => {
        if (minhaSala && salas[minhaSala]) {
            salas[minhaSala].jogadores = salas[minhaSala].jogadores.filter(j => j.id !== socket.id);
            
            // Se a sala ficar vazia, apaga da memória para economizar servidor
            if (salas[minhaSala].jogadores.length === 0) {
                delete salas[minhaSala];
            } else {
                io.to(minhaSala).emit('atualizarSala', salas[minhaSala]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor de Planning Poker rodando na porta ${PORT}`));
