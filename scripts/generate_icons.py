import zlib
import struct
import os

def create_icon_png(size: int, r: int, g: int, b: int) -> bytes:
    # 8-byte PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk: width, height, bit depth (8), color type (6 = RGBA)
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    ihdr_crc = struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff)
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + ihdr_crc
    
    raw = bytearray()
    center = (size - 1) / 2.0
    half_box = size * 0.42
    corner_radius = size * 0.22
    inner_box = half_box - corner_radius

    for y in range(size):
        raw.append(0) # PNG scanline filter: None
        for x in range(size):
            dx = abs(x - center)
            dy = abs(y - center)
            
            # Rounded rect check
            inside = False
            if dx <= half_box and dy <= half_box:
                if dx > inner_box and dy > inner_box:
                    if (dx - inner_box)**2 + (dy - inner_box)**2 <= corner_radius**2:
                        inside = True
                else:
                    inside = True
            
            if inside:
                # Add subtle accent note lines for 48 and 128
                is_line = False
                if size >= 48:
                    line_start_x = center - half_box * 0.55
                    line_end_x = center + half_box * 0.55
                    line1_y = center - half_box * 0.25
                    line2_y = center + half_box * 0.05
                    line3_y = center + half_box * 0.35
                    
                    line_thickness = max(1.0, size * 0.05)
                    
                    if (line_start_x <= x <= line_end_x and abs(y - line1_y) <= line_thickness / 2) or \
                       (line_start_x <= x <= line_end_x and abs(y - line2_y) <= line_thickness / 2) or \
                       (line_start_x <= x <= center and abs(y - line3_y) <= line_thickness / 2):
                        is_line = True
                
                if is_line:
                    raw.extend([255, 255, 255, 240]) # White accent note lines
                else:
                    raw.extend([r, g, b, 255])       # Indigo brand background
            else:
                raw.extend([0, 0, 0, 0])             # Transparent
                
    compressed = zlib.compress(bytes(raw))
    idat_crc = struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + idat_crc
    
    # IEND chunk
    iend_crc = struct.pack('>I', zlib.crc32(b'IEND') & 0xffffffff)
    png += struct.pack('>I', 0) + b'IEND' + iend_crc
    return png

def main():
    target_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
    os.makedirs(target_dir, exist_ok=True)
    
    # Indigo color (#4F46E5 -> 79, 70, 229)
    for size in [16, 48, 128]:
        data = create_icon_png(size, 79, 70, 229)
        output_path = os.path.join(target_dir, f'icon-{size}.png')
        with open(output_path, 'wb') as f:
            f.write(data)
        print(f'Created {output_path} ({size}x{size}px)')

if __name__ == '__main__':
    main()
