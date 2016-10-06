import React, { PropTypes } from 'react';
import classNames from 'classnames';
import memoize from 'lodash/memoize';
import { CommonPropTypes, eventHandleWrapper, PureComponent } from '../../../utils';

import styles from './option.css';

export default class Group extends PureComponent {
  static onClickWrapper(optionValue, onClick) {
    return eventHandleWrapper(onClick, optionValue);
  }

  constructor(props) {
    super(props);

    this.wrappedOnClick = memoize(Group.onClickWrapper);
  }

  render() {
    const { children, className, onClick, style } = this.props;
    const numOptions = React.Children.count(children);

    return (
      <div className={classNames(className)} style={style}>
        {
          React.Children.map(children, (child, index) => {
            const childProps = {
              className: classNames(styles.option, {
                [styles.first]: index === 0,
                [styles.last]: index === numOptions - 1,
              }, child.props.className),
              onClick: this.wrappedOnClick(child.props.value, onClick),
            };

            return React.cloneElement(child, childProps);
          })
        }
      </div>
    );
  }
}

Group.propTypes = {
  children: PropTypes.node.isRequired,
  className: CommonPropTypes.className,

  /* function with following signature: function(event, selectedOptionValue) */
  onClick: PropTypes.func.isRequired,
  style: CommonPropTypes.style,
};

Group.defaultProps = {
  className: styles.group,
};
