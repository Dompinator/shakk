const chess = new Chess();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset');
const undoBtn = document.getElementById('undo');

const pieces = {
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
};

let selectedSquare = null;
let possibleMoves = [];

function renderBoard() {
    boardEl.innerHTML = '';
    const board = chess.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const isLight = (row + col) % 2 === 0;
            square.className = `square ${isLight ? 'light' : 'dark'}`;
            const file = String.fromCharCode(97 + col); // a-h
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

            if (selectedSquare === squareName) {
                square.classList.add('selected');
            }
            if (possibleMoves.includes(squareName)) {
                square.classList.add('possible');
            }

            square.addEventListener('click', () => onSquareClick(squareName));
            boardEl.appendChild(square);
        }
    }
    updateStatus();
}

function onSquareClick(square) {
    if (selectedSquare) {
        // Try to move
        const move = chess.move({
            from: selectedSquare,
            to: square,
            promotion: 'q' // always promote to queen for simplicity
        });
        if (move) {
            selectedSquare = null;
            possibleMoves = [];
            renderBoard();
            return;
        }
    }

    // Select piece
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

function updateStatus() {
    let status = '';
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    if (chess.in_checkmate()) {
        status = `Checkmate! ${turn === 'White' ? 'Black' : 'White'} wins.`;
    } else if (chess.in_draw()) {
        status = 'Draw!';
    } else if (chess.in_check()) {
        status = `${turn} is in check.`;
    } else {
        status = `${turn} to move`;
    }
    statusEl.textContent = status;
}

resetBtn.addEventListener('click', () => {
    chess.reset();
    selectedSquare = null;
    possibleMoves = [];
    renderBoard();
});

undoBtn.addEventListener('click', () => {
    chess.undo();
    selectedSquare = null;
    possibleMoves = [];
    renderBoard();
});

// Initial render
renderBoard();
