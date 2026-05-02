using System;

namespace Settleora.Api.Auth.PasswordHashing;

[Flags]
internal enum PasswordRehashReason
{
    None = 0,
    ExplicitCredentialFlag = 1,
    PolicyVersionMismatch = 2,
    WorkFactorMismatch = 4,
    ParameterMetadataMismatch = 8
}
