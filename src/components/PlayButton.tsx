import clsx from 'clsx';

export const PlayButton = ({
  state,
  progress,
  onClick
}: {
  state: 'idle' | 'launching' | 'disabled';
  progress: number;
  onClick: () => void;
}) => {
  const disabled = state === 'disabled';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx('relative h-[62px] w-full overflow-hidden rounded-[20px] border text-base font-bold transition-all duration-200 ease-premium active:scale-[0.98]', {
        'border-bc-accent bg-bc-accent text-white shadow-accent hover:brightness-110': state !== 'disabled',
        'cursor-not-allowed border-white/10 bg-[#3A3F47] text-white/70': disabled
      })}
    >
      {state === 'idle' && 'Играть'}
      {state === 'launching' && 'Запуск...'}
      {state === 'disabled' && 'Сервер недоступен'}

      {state === 'launching' && (
        <span className="absolute bottom-0 left-0 h-[3px] bg-white/90 transition-all duration-200 ease-premium" style={{ width: `${progress}%` }} />
      )}
    </button>
  );
};
