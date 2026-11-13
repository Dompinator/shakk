const SUPABASE_URL = 'https://devxzklnldwhyxrlorck.supabase.co';
const SUPABASE_KEY = 'sb_publishable_X7YnI_XIJUZi1tfklN6-FQ_RpVEDKy1';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const chess = new Chess();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const findMatchBtn = document.getElementById('findMatch');
const resetBtn = document.getElementById('reset');
const infoEl = document.getElementById('info');

const pieces = {
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
};

let playerId = localStorage.getItem('playerId') || crypto.randomUUID();
localStorage.setItem('playerId', playerId);

let currentGameId = null;
let myColor = null;
let selectedSquare = null;
let possibleMoves = [];
let channel = null;

function renderBoard() {
    boardEl.innerHTML = '';
    const board = chess.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const isLight = (row + col) % 2 === 0;
            square.className = `square ${isLight ? 'light' : 'dark'}`;
            const file = String.fromCharCode(97 + col);
            const rank = 8 - row;
            const squareName = file + rank;
            square.dataset.square = squareName;

            const piece = board[row][col];
            if (piece) {
                const pieceSpan = document.createElement('span');
                pieceSpan.className = 'piece';
                const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                pieceSpan.textContent = pieces[key];
                square.appendChild(pieceSpan);
            }

            if (selectedSquare === squareName) square.classList.add('selected');
            if (possibleMoves.includes(squareName)) square.classList.add('possible');

            square.addEventListener('click', () => onSquareClick(squareName));
            boardEl.appendChild(square);
        }
    }
    updateStatus();
}

function updateStatus() {
    if (!currentGameId) {
        statusEl.textContent = 'Click Find Match to play';
        return;
    }
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    const myTurn = (chess.turn() === 'w' && myColor === 'white') || (chess.turn() === 'b' && myColor === 'black');
    if (chess.in_checkmate()) {
        statusEl.textContent = `Checkmate! ${turn === 'White' ? 'Black' : 'White'} wins.`;
    } else if (chess.in_draw()) {
        statusEl.textContent = 'Draw!';
    } else if (chess.in_check()) {
        statusEl.textContent = `${turn} is in check. ${myTurn ? '(Your turn)' : ''}`;
    } else {
        statusEl.textContent = `${turn} to move ${myTurn ? '(Your turn)' : '(Opponent turn)'}`;
    }
}

async function onSquareClick(square) {
    if (!currentGameId || !myColor) return;
    const isMyTurn = (chess.turn() === 'w' && myColor === 'white') || (chess.turn() === 'b' && myColor === 'black');
    if (!isMyTurn) return;

    if (selectedSquare) {
        const move = chess.move({
            from: selectedSquare,
            to: square,
            promotion: 'q'
        });
        if (move) {
            // Update Supabase
            await supabase.from('games').update({
                fen: chess.fen(),
                turn: chess.turn(),
                updated_at: new Date().toISOString()
            }).eq('id', currentGameId);

            // Optionally log move
            await supabase.from('moves').insert({
                game_id: currentGameId,
                move: move.san,
                fen: chess.fen(),
                player: myColor
            });

            selectedSquare = null;
            possibleMoves = [];
            renderBoard();
            return;
        }
    }

    const piece = chess.get(square);
    if (piece && piece.color === chess.turn()) {
        selectedSquare = square;
        possibleMoves = chess.moves({ square, verbose: true }).map(m => m.to);
    } else {
        selectedSquare = null;
        possibleMoves = [];
    }
    renderBoard();
}

async function findMatch() {
    findMatchBtn.disabled = true;
    statusEl.textContent = 'Searching for opponent...';

    // Look for waiting game
    const { data: waiting } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'waiting')
        .is('black_player', null)
        .order('created_at', { ascending: true })
        .limit(1);

    if (waiting && waiting.length > 0) {
        // Join as black
        const game = waiting[0];
        await supabase.from('games').update({
            black_player: playerId,
            status: 'active'
        }).eq('id', game.id);

        currentGameId = game.id;
        myColor = 'black';
        chess.load(game.fen);
        subscribeToGame();
        infoEl.textContent = 'You are Black';
    } else {
        // Create new game as white
        const { data: newGame } = await supabase.from('games').insert({
            white_player: playerId,
            status: 'waiting',
            fen: chess.fen()
        }).select().single();

        currentGameId = newGame.id;
        myColor = 'white';
        subscribeToGame();
        infoEl.textContent = 'You are White - waiting for opponent...';
    }

    findMatchBtn.style.display = 'none';
    resetBtn.style.display = 'inline-block';
    renderBoard();
}

function subscribeToGame() {
    if (channel) supabase.removeChannel(channel);
    channel = supabase.channel('game-' + currentGameId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${currentGameId}`
        }, (payload) => {
            const game = payload.new;
            if (game.fen && game.fen !== chess.fen()) {
                chess.load(game.fen);
                selectedSquare = null;
                possibleMoves = [];
                renderBoard();
            }
            if (game.status === 'active' && myColor === 'white') {
                infoEl.textContent = 'Opponent joined! You are White';
            }
        })
        .subscribe();
}

findMatchBtn.addEventListener('click', findMatch);

resetBtn.addEventListener('click', () => {
    if (channel) supabase.removeChannel(channel);
    currentGameId = null;
    myColor = null;
    chess.reset();
    selectedSquare = null;
    possibleMoves = [];
    findMatchBtn.style.display = 'inline-block';
    findMatchBtn.disabled = false;
    resetBtn.style.display = 'none';
    infoEl.textContent = 'Multiplayer chess with matchmaking';
    renderBoard();
});

renderBoard();
