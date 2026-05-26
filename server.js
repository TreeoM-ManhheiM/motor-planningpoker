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
        
        // Adicionado: 'prontoParaReiniciar'
        salas[sala].jogadores.push({ 
            id: socket.id, 
            nome: apelido, 
            voto: null, 
            prontoParaRevelar: false,
            prontoParaReiniciar: false 
        });
        
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
            jogador.prontoParaRevelar = false; 
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 3. Jogador clica em Revelar Votos
    socket.on('revelarVotos', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        if (sala.revelado) return;

        let jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.prontoParaRevelar = true;
        }

        let todosProntos = sala.jogadores.every(j => j.prontoParaRevelar === true);

        if (todosProntos) {
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

            // Opcional: quando revela, garante que ninguém está "pronto para reiniciar" ainda
            sala.jogadores.forEach(j => j.prontoParaReiniciar = false);

            io.to(minhaSala).emit('votosRevelados', { sala, stats });
        } else {
            io.to(minhaSala).emit('atualizarSala', sala);
        }
    });

    // 4. Jogador clica em Nova Rodada (Regra de Consenso Aplicada)
    socket.on('reiniciarRodada', () => {
        if (!minhaSala || !salas[minhaSala]) return;
        let sala = salas[minhaSala];
        
        // Só faz sentido pedir para reiniciar se a mesa já estiver revelada
        if (!sala.revelado) return;

        let jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.prontoParaReiniciar = true;
        }

        // Verifica se TODOS clicaram em "Nova Rodada"
        let todosQueremReiniciar = sala.jogadores.every(j => j.prontoParaReiniciar === true);

        if (todosQueremReiniciar) {
            sala.revelado = false;
            
            sala.jogadores.forEach(j => {
                j.voto = null;
                j.prontoParaRevelar = false;
                j.prontoParaReiniciar = false; // Zera para a próxima
            });
            
            io.to(minhaSala).emit('rodadaReiniciada', sala);
        } else {
            // Se nem todos clicaram, apenas atualiza a tela para mostrar o status
            io.to(minhaSala).emit('atualizarSala', sala);
        }
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
