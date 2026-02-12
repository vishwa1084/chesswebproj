import './App.css'
import wk from './assets/wk.png'
import wq from './assets/wq.png'
import wr from './assets/wr.png'
import wb from './assets/wb.png'
import wn from './assets/wn.png'
import wp from './assets/wp.png'

import bk from './assets/bk.png'
import bq from './assets/bq.png'
import br from './assets/br.png'
import bb from './assets/bb.png'
import bn from './assets/bn.png'
import bp from './assets/bp.png'

function App() {
  
  const pieceImages = {
  wk, wq, wr, wb, wn, wp,
  bk, bq, br, bb, bn, bp
};

  const initialBoard = [
    "br","bn","bb","bq","bk","bb","bn","br",
    "bp","bp","bp","bp","bp","bp","bp","bp",
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    "wp","wp","wp","wp","wp","wp","wp","wp",
    "wr","wn","wb","wq","wk","wb","wn","wr"
  ];


  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const index =row*8+col;
      const piece=initialBoard[index]
      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className="square"
          style={{
            backgroundColor: isLight ? "#e8e9f0" : "#5a65ac"
          }}
        >
         {piece && (
            <img
              src={pieceImages[piece]}
              className="piece"
              
            />
          )}

          </div>
      );
    }
  }
 
  return (
    <>
      <div className="navigator">
        <h1>CHESS</h1>
        <h3>Friends</h3>
        <h3>Multiplayer</h3>
        <h3>Singleplayer</h3>
      </div>
      <div>
        
      </div>
      <h5 id="oppname">oponent</h5>
      <p> record:</p>
      <div className="container">
        <div className="board">
          {squares}
        </div>
      </div>
      <h5 id="playerid">player</h5>
      
    </>
  );
}

export default App;