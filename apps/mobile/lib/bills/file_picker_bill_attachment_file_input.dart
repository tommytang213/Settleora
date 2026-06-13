import 'package:file_picker/file_picker.dart';

import 'bill_attachment_file_input.dart';

class FilePickerSettleoraBillAttachmentFileInput
    implements SettleoraBillAttachmentFileInput {
  const FilePickerSettleoraBillAttachmentFileInput();

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: billAttachmentFileExtensionsForContentTypes(
        allowedContentTypes,
      ),
      allowMultiple: false,
      withData: true,
    );
    final files = result?.files;
    if (files == null || files.isEmpty) {
      return null;
    }

    final file = files.first;
    final bytes = file.bytes;
    if (bytes == null) {
      throw const SettleoraBillAttachmentFileInputFailure(
        'The selected file could not be read. Choose another file.',
      );
    }

    return pickedBillAttachmentFileFromBytes(
      filename: file.name,
      contentType: billAttachmentContentTypeForFilename(file.name),
      bytes: bytes,
      localPath: file.path,
      allowedContentTypes: allowedContentTypes,
    );
  }
}
