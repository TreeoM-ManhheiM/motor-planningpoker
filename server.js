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
            salas[sala] = { 
                jogadores: [], 
                moderador: socket.id, 
                revelado: false 
            };
        }
        
        salas[sala].jogadores = salas[sala].jogadores.filter(j => j.id !== socket.id);
        
        if (!salas[sala].moderador) {
            salas[sala].moderador = socket.id;
        }
        
        salas[sala].jogadores.push({ id: socket.id, nome: apelido, voto: null });
        
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
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 3. APENAS MODERADOR: Revelar Votos com Cálculo de Extremos Pedagógicos
    socket.on('revelarVotos', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        if (sala.moderador !== socket.id) return;

        sala.revelado = true;
        
        // Filtra apenas os votos que são números para não quebrar o cálculo com '?' ou '☕'
        let jogadoresComVotoNumerico = sala.jogadores.filter(j => j.voto !== null && j.voto !== '?' && j.voto !== '☕');
        let votosValidos = jogadoresComVotoNumerico.map(j => Number(j.voto));
            
        let stats = { 
            media: 0, 
            consenso: false,
            menorVoto: null,
            maiorVoto: null,
            jogadoresMenor: [],
            jogadoresMaior: []
        };
        
        if (votosValidos.length > 0) {
            let soma = votosValidos.reduce((a, b) => a + b, 0);
            stats.media = (soma / votosValidos.length).toFixed(1);
            
            let min = Math.min(...votosValidos);
            let max = Math.max(...votosValidos);
            
            stats.menorVoto = min;
            stats.maiorVoto = max;
            stats.consenso = (min === max);

            // Se não houver consenso, mapeia quem são os donos das maiores e menores notas
            if (!stats.consenso) {
                stats.jogadoresMenor = jogadoresComVotoNumerico.filter(j => Number(j.voto) === min).map(j => j.nome);
                stats.jogadoresMaior = jogadoresComVotoNumerico.filter(j => Number(j.voto) === max).map(j => j.nome);
            }
        }

        io.to(minhaSala).emit('votosRevelados', { sala, stats });
    });

    // 4. APENAS MODERADOR: Nova Rodada
    socket.on('reiniciarRodada', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        if (sala.moderador !== socket.id) return;

        sala.revelado = false;
        sala.jogadores.forEach(j => j.voto = null);
        
        io.to(minhaSala).emit('rodadaReiniciada', sala);
    });

    // 5. APENAS MODERADOR: Chutar Jogador
    socket.on('chutarJogador', (idAlvo) => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        if (sala.moderador !== socket.id) return;

        io.to(idAlvo).emit('voceFoiChutado');
        sala.jogadores = sala.jogadores.filter(j => j.id !== idAlvo);
        io.to(minhaSala).emit('atualizarSala', sala);
    });

    socket.on('disconnect', () => {
        if (minhaSala && salas[minhaSala]) {
            let sala = salas[minhaSala];
            sala.jogadores = sala.jogadores.filter(j => j.id !== socket.id);
            
            if (sala.jogadores.length === 0) {
                delete salas[minhaSala];
            } else {
                if (sala.moderador === socket.id) {
                    sala.moderador = sala.jogadores[0].id;
                }
                io.to(minhaSala).emit('atualizarSala', sala);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
