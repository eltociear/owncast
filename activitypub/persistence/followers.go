package persistence

import (
	"context"

	"github.com/owncast/owncast/db"
	"github.com/owncast/owncast/models"
	"github.com/owncast/owncast/utils"
	"github.com/pkg/errors"
)

// GetFollowerCount will return the number of followers we're keeping track of.
func GetFollowerCount() (int64, error) {
	ctx := context.Background()
	return _datastore.GetQueries().GetFollowerCount(ctx)
}

// GetFederationFollowers will return a slice of the followers we keep track of locally.
func GetFederationFollowers(limit int, offset int) ([]models.Follower, int, error) {
	ctx := context.Background()
	total, err := _datastore.GetQueries().GetFollowerCount(ctx)
	if err != nil {
		return nil, 0, errors.Wrap(err, "unable to fetch total number of followers")
	}

	followersResult, err := _datastore.GetQueries().GetFederationFollowersWithOffset(ctx, db.GetFederationFollowersWithOffsetParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	followers := make([]models.Follower, 0)

	for _, row := range followersResult {
		singleFollower := models.Follower{
			Name:      row.Name.String,
			Username:  row.Username,
			Image:     row.Image.String,
			ActorIRI:  row.Iri,
			Inbox:     row.Inbox,
			Timestamp: utils.NullTime(row.CreatedAt),
		}

		followers = append(followers, singleFollower)
	}

	return followers, int(total), nil
}

// GetPendingFollowRequests will return pending follow requests.
func GetPendingFollowRequests() ([]models.Follower, error) {
	pendingFollowersResult, err := _datastore.GetQueries().GetFederationFollowerApprovalRequests(context.Background())
	if err != nil {
		return nil, err
	}

	followers := make([]models.Follower, 0)

	for _, row := range pendingFollowersResult {
		singleFollower := models.Follower{
			Name:      row.Name.String,
			Username:  row.Username,
			Image:     row.Image.String,
			ActorIRI:  row.Iri,
			Inbox:     row.Inbox,
			Timestamp: utils.NullTime{Time: row.CreatedAt.Time, Valid: true},
		}
		followers = append(followers, singleFollower)
	}

	return followers, nil
}

// GetBlockedAndRejectedFollowers will return blocked and rejected followers.
func GetBlockedAndRejectedFollowers() ([]models.Follower, error) {
	pendingFollowersResult, err := _datastore.GetQueries().GetRejectedAndBlockedFollowers(context.Background())
	if err != nil {
		return nil, err
	}

	followers := make([]models.Follower, 0)

	for _, row := range pendingFollowersResult {
		singleFollower := models.Follower{
			Name:       row.Name.String,
			Username:   row.Username,
			Image:      row.Image.String,
			ActorIRI:   row.Iri,
			DisabledAt: utils.NullTime{Time: row.DisabledAt.Time, Valid: true},
			Timestamp:  utils.NullTime{Time: row.CreatedAt.Time, Valid: true},
		}
		followers = append(followers, singleFollower)
	}

	return followers, nil
}
