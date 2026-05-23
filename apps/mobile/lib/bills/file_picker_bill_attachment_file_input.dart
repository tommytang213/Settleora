import 'package:file_picker/file_picker.dart';

import 'bill_attachment_file_input.dart';

class FilePickerSettleoraBillAttachmentFileInput
    implements SettleoraBillAttachmentFileInput {
  FilePickerSettleoraBillAttachmentFileInput({FilePicker? filePicker})
    : _filePicker = filePicker ?? FilePicker.platform;

  final FilePicker _filePicker;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    final result = await _filePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: billAttachmentFileExtensionsForContentTypes(
        allowedContentTypes,
      ),
      allowMultiple: false,
      allowCompression: false,
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
      allowedContentTypes: allowedContentTypes,
    );
  }
}
