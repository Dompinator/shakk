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
        if (infoEl) infoEl.textContent = 'Local game';
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
};

window.startOnline = async function() {
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
    }
};
