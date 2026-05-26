const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let salas = {};

io.on('connection', (socket) => {
    let minhaSala = null;

    // 1. Jogador entra na sala
    socket.on('entrarSala', ({ apelido, sala }) => {
        socket.join(sala);
        minhaSala = sala;
        
        if (!salas[sala]) {
            salas[sala] = { jogadores: [], revelado: false };
        }
        
        salas[sala].jogadores = salas[sala].jogadores.filter(j => j.id !== socket.id);
        
        // Adicionado o estado 'prontoParaRevelar' para cada jogador
        salas[sala].jogadores.push({ id: socket.id, nome: apelido, voto: null, prontoParaRevelar: false });
        
        io.to(sala).emit('atualizarSala', salas[sala]);
    });

    // 2. Jogador escolhe uma carta
    socket.on('votar', (voto) => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        if (sala.revelado) return;

        let jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.voto = (jogador.voto === voto) ? null : voto;
            // Se ele mudar o voto, desmarca a prontidão de revelar por segurança
            jogador.prontoParaRevelar = false; 
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 3. Jogador clica em Revelar Votos (Nova Regra)
    socket.on('revelarVotos', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        if (sala.revelado) return;

        let jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.prontoParaRevelar = true;
        }

        // Verifica se TODOS os jogadores da sala clicaram em revelar
        let todosProntos = sala.jogadores.every(j => j.prontoParaRevelar === true);

        if (todosProntos) {
            // Se TODOS clicaram, revela geral!
            sala.revelado = true;
            
            let votosValidos = sala.jogadores
                .map(j => j.voto)
                .filter(v => v !== null && v !== '?' && v !== '☕')
                .map(Number);
                
            let stats = { media: 0, consenso: false };
            
            if (votosValidos.length > 0) {
                let soma = votosValidos.reduce((a, b) => a + b, 0);
                stats.media = (soma / votosValidos.length).toFixed(1);
                
                let primeiroVoto = votosValidos[0];
                stats.consenso = votosValidos.every(v => v === primeiroVoto);
            }

            io.to(minhaSala).emit('votosRevelados', { sala, stats });
        } else {
            // Se nem todos clicaram, apenas atualiza a mesa para mostrar quem já pediu para revelar
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 4. Nova Rodada (Reinicia os estados)
    socket.on('reiniciarRodada', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        sala.revelado = false;
        
        sala.jogadores.forEach(j => {
            j.voto = null;
            j.prontoParaRevelar = false;
        });
        
        io.to(minhaSala).emit('rodadaReiniciada', sala);
    });

    socket.on('disconnect', () => {
        if (minhaSala && salas[minhaSala]) {
            salas[minhaSala].jogadores = salas[minhaSala].jogadores.filter(j => j.id !== socket.id);
            if (salas[minhaSala].jogadores.length === 0) {
                delete salas[minhaSala];
            } else {
                io.to(minhaSala).emit('atualizarSala', salas[minhaSala]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
