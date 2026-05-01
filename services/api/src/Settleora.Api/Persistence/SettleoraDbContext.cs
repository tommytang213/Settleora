using Microsoft.EntityFrameworkCore;

namespace Settleora.Api.Persistence;

public sealed class SettleoraDbContext : DbContext
{
    public SettleoraDbContext(DbContextOptions<SettleoraDbContext> options)
        : base(options)
    {
    }
}
