// Chess + matchmaking (loaded after auth functions)
const SUPABASE_URL = 'https://devxzklnldwhyxrlorck.supabase.co';
const SUPABASE_KEY = 'sb_publishable_X7YnI_XIJUZi1tfklN6-FQ_RpVEDKy1';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let chess = new Chess();
let mode = null;
let currentGameId = null;
let myColor = null;
let selectedSquare = null;
let possibleMoves = [];
let channel = null;

let botEnabled = false;
let botTimer = null;
let botThinking = false;

// Lightweight local chess engine. It searches legal chess.js moves and scores
// positions by material, piece activity, king safety and checkmate.
const BOT_VALUES = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };

function botEvaluate(position) {
    if (position.in_checkmate()) return position.turn() === 'w' ? -100000 : 100000;
    if (position.in_draw() || position.in_stalemate()) return 0;

    let score = 0;
    const board = position.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (!piece) continue;
            const sign = piece.color === 'w' ? 1 : -1;
            const value = BOT_VALUES[piece.type] || 0;
            const center = 3.5 - (Math.abs(3.5 - col) + Math.abs(3.5 - row)) / 2;
            let activity = 0;
            if (piece.type === 'n' || piece.type === 'b') activity = center * 7;
            if (piece.type === 'p') activity = (piece.color === 'w' ? 6 - row : row - 1) * 5;
            if (piece.type === 'k' && row >= 2 && row <= 5) activity -= 12;
            score += sign * (value + activity);
        }
    }
    if (position.in_check()) score += position.turn() === 'w' ? -35 : 35;
    return score;
}

function botSearch(position, depth, alpha, beta) {
    if (depth <= 0 || position.game_over()) return botEvaluate(position);

    const moves = position.moves({ verbose: true });
    moves.sort((a, b) => {
        const av = (b.captured ? BOT_VALUES[b.captured] : 0) - (a.captured ? BOT_VALUES[a.captured] : 0);
        const bv = (a.captured ? BOT_VALUES[a.captured] : 0) - (b.captured ? BOT_VALUES[b.captured] : 0);
        return av - bv;
    });

    const maximizing = position.turn() === 'w';
    let best = maximizing ? -Infinity : Infinity;
    for (const candidate of moves) {
        const move = position.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion || 'q' });
        if (!move) continue;
        const score = botSearch(position, depth - 1, alpha, beta);
        position.undo();

        if (maximizing) {
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
        } else {
            best = Math.min(best, score);
            beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
    }
    return best;
}

function findBestBotMove() {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const maximizing = chess.turn() === 'w';
    let bestScore = maximizing ? -Infinity : Infinity;
    let bestMoves = [];
    for (const candidate of moves) {
        const move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion || 'q' });
        if (!move) continue;
        const score = botSearch(chess, 2, -Infinity, Infinity);
        chess.undo();
        if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
            bestScore = score;
            bestMoves = [candidate];
        } else if (score === bestScore) {
            bestMoves.push(candidate);
        }
    }
    return bestMoves[0] || null;
}

function stopBotTimer() {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    botThinking = false;
}

function scheduleBotMove() {
    stopBotTimer();
    if (!botEnabled || mode !== 'single' || chess.game_over()) return;
    botThinking = true;
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = 'SHakk Auto Bot · Moving in 5 seconds…';
    botTimer = setTimeout(() => {
        botTimer = null;
        if (!botEnabled || mode !== 'single' || chess.game_over()) {
            botThinking = false;
            return;
        }
        const best = findBestBotMove();
        if (best) {
            const move = chess.move({
                from: best.from,
                to: best.to,
                promotion: best.promotion || 'q'
            });
            if (move) {
                selectedSquare = null;
                possibleMoves = [];
                renderBoard();
            }
        }
        botThinking = false;
        if (botEnabled && !chess.game_over()) scheduleBotMove();
        else renderBoard();
    }, 5000);
}

function toggleBot() {
    if (mode !== 'single') {
        const infoEl = document.getElementById('info');
        if (infoEl) infoEl.textContent = 'F2 Auto Bot is available in local games only.';
        return;
    }
    botEnabled = !botEnabled;
    stopBotTimer();
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.textContent = botEnabled
        ? 'Auto Bot ON · Best-move search · 5-second turns'
        : 'Auto Bot OFF';
    if (botEnabled) scheduleBotMove();
    else renderBoard();
}

const pieces = {
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
};

function showGame() {
    document.getElementById('auth').style.display = 'none';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    renderBoard();
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    const board = chess.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const isLight = (row + col) % 2 === 0;
            square.className = 'square ' + (isLight ? 'light' : 'dark');
            const file = String.fromCharCode(97 + col);
            const rank = 8 - row;
            const squareName = file + rank;
            const piece = board[row][col];
            if (piece) {
                const span = document.createElement('span');
                span.className = 'piece';
                const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                span.textContent = pieces[key];
                square.appendChild(span);
            }
            if (selectedSquare === squareName) square.classList.add('selected');
            if (possibleMoves.includes(squareName)) square.classList.add('possible');
            square.onclick = () => onSquareClick(squareName);
            boardEl.appendChild(square);
        }
    }
    updateStatus();
}

function updateStatus() {
    const statusEl = document.getElementById('status');
    const infoEl = document.getElementById('info');
    if (!statusEl) return;
    if (mode === 'single') {
        const turn = chess.turn() === 'w' ? 'White' : 'Black';
        statusEl.textContent = chess.in_checkmate() ? 'Checkmate!' : (chess.in_check() ? turn + ' in check' : turn + ' to move');
        if (infoEl) infoEl.textContent = botEnabled ? 'Auto Bot ON · 5-second turns (F2 to stop)' : 'Local game (F2: Auto Bot)';
        return;
    }
    if (!currentGameId || !myColor) {
        statusEl.textContent = 'Finding Match...';
        return;
    }
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    const myTurn = (chess.turn() === 'w' && myColor === 'white') || (chess.turn() === 'b' && myColor === 'black');
    statusEl.textContent = chess.in_checkmate() ? 'Checkmate!' : (turn + ' to move ' + (myTurn ? '(You)' : '(Opponent)'));
}

function onSquareClick(square) {
    if (botEnabled && mode === 'single') return;
    if (mode === 'online' && currentGameId && myColor) {
        const isMyTurn = (chess.turn() === 'w' && myColor === 'white') || (chess.turn() === 'b' && myColor === 'black');
        if (!isMyTurn) return;
    }
    if (selectedSquare) {
        const move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (move) {
            if (mode === 'online' && currentGameId) {
                supabase.from('games').update({
                    fen: chess.fen(),
                    turn: chess.turn(),
                    updated_at: new Date().toISOString()
                }).eq('id', currentGameId);
            }
            selectedSquare = null;
            possibleMoves = [];
            renderBoard();
            return;
        }
    }
    const piece = chess.get(square);
    if (piece && piece.color === chess.turn()) {
        selectedSquare = square;
        possibleMoves = chess.moves({ square: square, verbose: true }).map(m => m.to);
    } else {
        selectedSquare = null;
        possibleMoves = [];
    }
    renderBoard();
}

window.startSingle = function() {
    mode = 'single';
    chess.reset();
    selectedSquare = null;
    possibleMoves = [];
    showGame();
    if (botEnabled) scheduleBotMove();
};

window.startOnline = async function() {
    stopBotTimer();
    botEnabled = false;
    mode = 'online';
    myColor = null;
    currentGameId = null;
    document.getElementById('status').textContent = 'Finding Match...';
    document.getElementById('info').textContent = 'Looking for opponent...';
    showGame();
    const user = window.currentUser;
    if (!user) { document.getElementById('info').textContent = 'Not logged in'; return; }

    const { data: waiting } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'waiting')
        .neq('white_player', user.id)
        .limit(1);

    if (waiting && waiting.length > 0) {
        const game = waiting[0];
        const otherPlayer = game.white_player;
        const iAmWhite = Math.random() < 0.5;
        const update = {
            black_player: iAmWhite ? otherPlayer : user.id,
            white_player: iAmWhite ? user.id : otherPlayer,
            status: 'active'
        };
        await supabase.from('games').update(update).eq('id', game.id);
        currentGameId = game.id;
        myColor = iAmWhite ? 'white' : 'black';
        chess.load(game.fen || chess.fen());
        document.getElementById('info').textContent = 'Matched! You are ' + (myColor === 'white' ? 'White' : 'Black');
        subscribe();
    } else {
        const { data: newGame } = await supabase.from('games').insert({
            white_player: user.id,
            status: 'waiting',
            fen: chess.fen()
        }).select().single();
        currentGameId = newGame.id;
        document.getElementById('info').textContent = 'Waiting for opponent...';
        subscribe();
    }
    renderBoard();
};

function subscribe() {
    if (channel) supabase.removeChannel(channel);
    channel = supabase.channel('game-' + currentGameId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + currentGameId }, (payload) => {
            const game = payload.new;
            const user = window.currentUser;
            if (game.status === 'active' && game.white_player && game.black_player && user) {
                if (game.white_player === user.id) myColor = 'white';
                else if (game.black_player === user.id) myColor = 'black';
                document.getElementById('info').textContent = 'Matched! You are ' + (myColor === 'white' ? 'White' : 'Black');
                if (game.fen) chess.load(game.fen);
                selectedSquare = null;
                possibleMoves = [];
                renderBoard();
            } else if (game.fen && game.fen !== chess.fen()) {
                chess.load(game.fen);
                selectedSquare = null;
                possibleMoves = [];
                renderBoard();
            }
        }).subscribe();
}

window.backToMenu = function() {
    stopBotTimer();
    botEnabled = false;
    if (channel) supabase.removeChannel(channel);
    mode = null;
    currentGameId = null;
    myColor = null;
    document.getElementById('game').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
};

window.resetGame = function() {
    if (mode === 'single') {
        chess.reset();
        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
        if (botEnabled) scheduleBotMove();
    }
};


document.addEventListener('keydown', (event) => {
    if (event.key !== 'F2' || event.repeat) return;
    const target = event.target;
    if (target && (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    event.preventDefault();
    toggleBot();
});
