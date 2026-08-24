use base64::Engine;
use image::{ImageBuffer, Rgb};
use serde::Serialize;
use std::io::Cursor;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
    GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HGDIOBJ, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

#[derive(Serialize)]
pub struct ScreenCapture {
    pub name: String,
    pub data: String,
}

#[tauri::command]
pub fn take_screenshot() -> Result<Vec<ScreenCapture>, String> {
    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.0.is_null() {
            return Err("Failed to get screen DC".to_string());
        }

        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        if width <= 0 || height <= 0 {
            ReleaseDC(None, hdc_screen);
            return Err("Invalid screen metrics".to_string());
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_hbm = SelectObject(hdc_mem, HGDIOBJ(hbm.0));

        let _ = BitBlt(hdc_mem, 0, 0, width, height, Some(hdc_screen), 0, 0, SRCCOPY);

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (width * height * 4) as usize];
        let lines_copied = GetDIBits(
            hdc_mem,
            hbm,
            0,
            height as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI objects
        SelectObject(hdc_mem, old_hbm);
        let _ = DeleteObject(HGDIOBJ(hbm.0));
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if lines_copied == 0 {
            return Err("Failed to extract bitmap bits".to_string());
        }

        // Convert BGRA to RGB image buffer
        let mut img: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::new(width as u32, height as u32);
        for y in 0..height as u32 {
            for x in 0..width as u32 {
                let idx = ((y * width as u32 + x) * 4) as usize;
                let b = raw_pixels[idx];
                let g = raw_pixels[idx + 1];
                let r = raw_pixels[idx + 2];
                img.put_pixel(x, y, Rgb([r, g, b]));
            }
        }

        // Resize down to 1280x720 if larger to match MARK 720p optimization
        let target_img = if width > 1280 {
            image::imageops::resize(&img, 1280, 720, image::imageops::FilterType::Triangle)
        } else {
            img
        };

        let mut jpeg_bytes = Vec::new();
        let mut cursor = Cursor::new(&mut jpeg_bytes);
        target_img
            .write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
        let data_url = format!("data:image/jpeg;base64,{}", b64);

        Ok(vec![ScreenCapture {
            name: "Primary Display".to_string(),
            data: data_url,
        }])
    }
}
