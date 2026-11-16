export async function optimizeJpegPhoto(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const baseScale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
		for (const dimensionScale of [1, 0.8, 0.64, 0.5]) {
			const scale = baseScale * dimensionScale;
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			const context = canvas.getContext("2d");
			if (!context) throw new Error("This photo could not be prepared.");
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			for (const quality of [0.72, 0.62, 0.52, 0.42, 0.32]) {
				const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
					(result) => result ? resolve(result) : reject(new Error("This photo could not be prepared.")),
					"image/jpeg",
					quality,
				));
				if (blob.size <= 400_000) {
					return await new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => resolve(String(reader.result));
						reader.onerror = () => reject(new Error("This photo could not be prepared."));
						reader.readAsDataURL(blob);
					});
				}
			}
		}
		throw new Error("This photo could not be reduced below 400 KB. Choose a smaller image.");
	} finally {
		bitmap.close();
	}
}
