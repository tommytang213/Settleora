using Microsoft.EntityFrameworkCore;

namespace Settleora.Api.Persistence;

internal sealed class SettleoraDbContext : DbContext
{
    public SettleoraDbContext(DbContextOptions<SettleoraDbContext> options)
        : base(options)
    {
    }
}
