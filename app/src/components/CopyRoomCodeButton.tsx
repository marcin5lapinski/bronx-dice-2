import { useState } from 'react';

interface CopyRoomCodeButtonProps {
  roomId: string;
}

const RESET_DELAY_MS = 1500;

function CopyRoomCodeButton({ roomId }: CopyRoomCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), RESET_DELAY_MS);
    });
  };

  return (
    <button type="button" className="copy-room-code-button" onClick={handleClick}>
      {copied ? 'Skopiowano!' : 'Kopiuj kod'}
    </button>
  );
}

export default CopyRoomCodeButton;
