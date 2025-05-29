// MCTSNode.mjs

export class MCTSNode {
    serialize() {
        const childrenSerialized = {};
        for (const moveStr in this.children) {
            childrenSerialized[moveStr] = this.children[moveStr].serialize();
        }
        return {
            boardState: this.boardState,
            currentPlayer: this.currentPlayer,
            move: this.move,
            visits: this.visits,
            wins: this.wins,
            children: childrenSerialized,
        };
    }
    static deserialize(jsonNodeData) {
        const node = new MCTSNode(jsonNodeData.boardState, jsonNodeData.currentPlayer, null, jsonNodeData.move);
        node.visits = jsonNodeData.visits;
        node.wins = jsonNodeData.wins;

        for (const moveStr in jsonNodeData.children) {
            const childNode = MCTSNode.deserialize(jsonNodeData.children[moveStr]);
            node.children[moveStr] = childNode;
            childNode.parent = node;
        }
        return node;
    }
}
