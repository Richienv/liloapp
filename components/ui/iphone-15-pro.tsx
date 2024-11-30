import Image from 'next/image';

interface Iphone15ProProps {
  src: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  mockupColor?: 'black' | 'white';
  priority?: boolean;
  imageClassName?: string;
}

const Iphone15Pro = ({ 
  src, 
  width = 346, 
  height = 705, 
  className = '', 
  style = {},
  mockupColor = 'black',
  priority = false,
  imageClassName = ''
}: Iphone15ProProps) => {
  return (
    <div className="relative" style={{ width, height }}>
      {/* iPhone frame */}
      <div className={`absolute inset-0 ${mockupColor === 'black' ? 'bg-black' : 'bg-white'} rounded-[3rem] shadow-xl`}>
        {/* Inner screen area */}
        <div className="absolute inset-[8px] bg-white rounded-[2.5rem] overflow-hidden">
          {/* Notch area */}
          <div className="absolute top-0 inset-x-20 h-6 bg-black z-20 rounded-b-3xl" />
          
          {/* Image container */}
          <div className="relative w-full h-full pt-6">
            <Image
              src={src}
              alt="Screen content"
              fill
              className={`${imageClassName} ${className}`}
              style={style}
              priority={priority}
              sizes="(max-width: 346px) 100vw, 346px"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Iphone15Pro;
