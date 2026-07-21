import sys
import os
from pdf2image import convert_from_path

if __name__ == "__main__":
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    os.makedirs(output_dir, exist_ok=True)
    
    pages = convert_from_path(pdf_path, dpi=150)
    output_files = []
    
    for i, page in enumerate(pages):
        output_path = os.path.join(output_dir, f"{i+1}.jpeg")
        page.save(output_path, "JPEG")
        output_files.append(output_path)
    
    print("\n".join(output_files))
