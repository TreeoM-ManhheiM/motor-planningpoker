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
        
        // Se a sala não existir, cria e define este primeiro jogador como MODERADOR/LÍDER
        if (!salas[sala]) {
            salas[sala] = { 
                jogadores: [], 
                moderador: socket.id, // ID do criador da sala
                revelado: false 
            };
        }
        
        salas[sala].jogadores = salas[sala].jogadores.filter(j => j.id !== socket.id);
        
        // Se por algum motivo a sala ficou sem moderador, assume o controle
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

    // 3. APENAS MODERADOR: Revelar Votos
    socket.on('revelarVotos', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        // Bloqueio de segurança: Só o moderador pode revelar
        if (sala.moderador !== socket.id) return;

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
    });

    // 4. APENAS MODERADOR: Nova Rodada
    socket.on('reiniciarRodada', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        // Bloqueio de segurança: Só o moderador pode reiniciar
        if (sala.moderador !== socket.id) return;

        sala.revelado = false;
        sala.jogadores.forEach(j => j.voto = null);
        
        io.to(minhaSala).emit('rodadaReiniciada', sala);
    });

    // 5. APENAS MODERADOR: Chutar Jogador Fantasma
    socket.on('chutarJogador', (idAlvo) => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        // Segurança: só o moderador pode chutar alguém
        if (sala.moderador !== socket.id) return;

        // Avisa especificamente o jogador alvo que ele foi expulso
        io.to(idAlvo).emit('voceFoiChutado');

        // Remove o jogador da lista da sala
        sala.jogadores = sala.jogadores.filter(j => j.id !== idAlvo);

        // Se o jogador expulso era o próprio canal ativo (improvável), limpa
        io.to(minhaSala).emit('atualizarSala', sala);
    });

    // 6. Desconexão natural (fechar aba)
    socket.on('disconnect', () => {
        if (minhaSala && salas[minhaSala]) {
            let sala = salas[minhaSala];
            sala.jogadores = sala.jogadores.filter(j => j.id !== socket.id);
            
            if (sala.jogadores.length === 0) {
                delete salas[minhaSala];
            } else {
                // Se o moderador sair, passa a coroa automaticamente para o próximo da fila
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
