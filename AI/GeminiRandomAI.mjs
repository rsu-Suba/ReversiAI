// RandomAI.mjs
export class RandomAI {
    makeMove(gameBoard) {
        const legalMoves = gameBoard.getLegalMoves();
        if (legalMoves.length === 0) {
            return null; // パス
        }
        const randomIndex = Math.floor(Math.random() * legalMoves.length);
        return legalMoves[randomIndex];
    }
}