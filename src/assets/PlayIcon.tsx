const PlayIcon = ({ size = 30 }: { size?: number }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
};

export default PlayIcon;
