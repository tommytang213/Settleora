// Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import CoreGraphics
import Foundation
import ImageIO

enum EncodedImageCodecError: LocalizedError {
    case emptyData
    case createImageSourceFailed
    case invalidDimensions
    case dimensionsExceeded
    case createImageFailed

    var errorDescription: String? {
        switch self {
        case .emptyData:
            return "Image data is empty"
        case .createImageSourceFailed:
            return "Could not create image source from data"
        case .invalidDimensions:
            return "Image dimensions are invalid"
        case .dimensionsExceeded:
            return "Image dimensions exceed the OCR limit"
        case .createImageFailed:
            return "Could not decode image from data"
        }
    }
}

/// Decodes PNG/JPEG/WebP and other formats supported by Image I/O into a ``CGImage``.
enum EncodedImageCodec {
    static func cgImage(
        fromEncodedData data: Data,
        maximumDimension: Int = 8_192,
        maximumPixels: Int = 16_000_000
    ) throws -> CGImage {
        guard !data.isEmpty else {
            throw EncodedImageCodecError.emptyData
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            throw EncodedImageCodecError.createImageSourceFailed
        }

        // Image I/O can allocate the full decoded bitmap when asked to create
        // the image. Read and bound the encoded header first so a small
        // decompression-bomb payload cannot allocate an enormous surface.
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any],
            let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
            let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
            width > 0,
            height > 0
        else {
            throw EncodedImageCodecError.invalidDimensions
        }
        guard
            width <= maximumDimension,
            height <= maximumDimension,
            width <= maximumPixels / height
        else {
            throw EncodedImageCodecError.dimensionsExceeded
        }

        let options: [CFString: Any] = [kCGImageSourceShouldCacheImmediately: true]
        guard let cgImage = CGImageSourceCreateImageAtIndex(source, 0, options as CFDictionary) else {
            throw EncodedImageCodecError.createImageFailed
        }
        guard
            cgImage.width == width,
            cgImage.height == height,
            cgImage.width <= maximumDimension,
            cgImage.height <= maximumDimension,
            cgImage.width <= maximumPixels / cgImage.height
        else {
            throw EncodedImageCodecError.dimensionsExceeded
        }
        return cgImage
    }
}
