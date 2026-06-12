import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../bills/bill_attachment_file_input.dart';

abstract interface class ReceiptImageIntake {
  Future<SettleoraPickedBillAttachmentFile?> pickReceiptImage({
    required ReceiptImageSource source,
  });
}

enum ReceiptImageSource { camera, gallery }

class ImagePickerReceiptImageIntake implements ReceiptImageIntake {
  ImagePickerReceiptImageIntake({ImagePicker? imagePicker})
    : _imagePicker = imagePicker ?? ImagePicker();

  final ImagePicker _imagePicker;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickReceiptImage({
    required ReceiptImageSource source,
  }) async {
    try {
      final image = await _imagePicker.pickImage(
        source: switch (source) {
          ReceiptImageSource.camera => ImageSource.camera,
          ReceiptImageSource.gallery => ImageSource.gallery,
        },
        requestFullMetadata: false,
      );
      if (image == null) {
        return null;
      }

      final bytes = await image.readAsBytes();
      return pickedBillAttachmentFileFromBytes(
        filename: image.name.isEmpty ? 'receipt.jpg' : image.name,
        contentType: _contentTypeForPickedImage(image.name, image.mimeType),
        bytes: bytes,
        localPath: image.path,
        allowedContentTypes:
            SettleoraBillAttachmentContentTypeValues.receiptValues,
      );
    } on PlatformException catch (error) {
      throw SettleoraBillAttachmentFileInputFailure(
        _safeImagePickerFailureMessage(error),
      );
    } catch (_) {
      throw const SettleoraBillAttachmentFileInputFailure(
        'The receipt image could not be selected. Manual entry is still available.',
      );
    }
  }
}

String _contentTypeForPickedImage(String filename, String? mimeType) {
  final normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType != null &&
      SettleoraBillAttachmentContentTypeValues.receiptValues.contains(
        normalizedMimeType,
      )) {
    return normalizedMimeType;
  }

  return billAttachmentContentTypeForFilename(filename);
}

String _safeImagePickerFailureMessage(PlatformException error) {
  final code = error.code.toLowerCase();
  if (code.contains('permission') || code.contains('denied')) {
    return 'Receipt image access was denied. Manual entry is still available.';
  }

  return 'The receipt image could not be selected. Manual entry is still available.';
}
