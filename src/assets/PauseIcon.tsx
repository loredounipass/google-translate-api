
const PauseIcon = ({ size = 30 }: { size?: number }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
    >
      <path
        fill="currentColor"
        d="M2.93 17.07A10 10 0 1 1 17.07 2.93A10 10 0 0 1 2.93 17.07zM7 6v8h2V6H7zm4 0v8h2V6h-2z"
      />
    </svg>
  );
};

export default PauseIcon;
